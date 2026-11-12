"""Request identity + object-level authorization (SEC-01 / SEC-05 / DATA-06).

Pramanyx grew up as a trusted-localhost tool: the only front door is an optional
shared API key, ``current_org_id()`` is never set per-request, and by-id
endpoints do no ownership check — any caller who knows a UUID can read/export/
delete any investigation or canvas.

This module adds the *seam* for real multi-tenant authorization, gated behind
``PRAMANYX_REQUIRE_IDENTITY`` (default OFF → today's single-user behaviour is
byte-identical). It is deliberately NOT full RBAC — just:

  1. a ``Principal`` (who + which org),
  2. per-request identity → ``set_org_id(principal.org)`` binding (done in
     ``api._require_auth``), so the tenant key finally rides the request path,
  3. ``authorize_resource`` / ``check_owner`` ownership checks, resolved through
     resource → connection → ``connections.org_id``.

SEAM NOTE — filled 2026-09-06 (VA-10, decision §6 item 11): ``resolve_principal``
now verifies an OIDC bearer first (``security/oidc.py`` — issuer + audience from
config, keys from the issuer's discovery document, fail-closed). The
``X-Pramanyx-Org`` header remains ONLY as the transitional self-host form, and it
stops resolving identity the moment an issuer is configured and identity is
required — the spoofable path and the verified path must not coexist. Every
other piece (contextvar binding, owner-checks) is unchanged, as promised.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from enum import Enum
from typing import Optional

from fastapi import HTTPException, Request

IDENTITY_ORG_HEADER = "X-Pramanyx-Org"
IDENTITY_USER_HEADER = "X-Pramanyx-User"


@dataclass(frozen=True)
class Principal:
    """The authenticated caller for a request: who they are and their tenant."""
    user_id: str
    org_id: str


def require_identity_enabled() -> bool:
    """Whether per-request identity is enforced. OFF by default (localhost mode).

    Read from the environment (not the runtime flag store) on purpose: an auth
    switch should require an explicit restart to flip, not a runtime toggle API.
    """
    return os.environ.get("PRAMANYX_REQUIRE_IDENTITY", "") == "1"


#: The operator's statement that an authenticating proxy in front of this API sets
#: ``X-Pramanyx-Org`` / ``X-Pramanyx-User`` and strips them from clients. The ONLY deployment
#: where the header seam is a credential rather than a label — and the app cannot tell it
#: apart from an open port, so the operator has to say so. A deployment setting like
#: ``PRAMANYX_OIDC_ISSUER``, read at request time from the environment like the switch above.
IDENTITY_FROM_PROXY_ENV = "PRAMANYX_IDENTITY_FROM_PROXY"


def identity_from_proxy() -> bool:
    return os.environ.get(IDENTITY_FROM_PROXY_ENV, "") == "1"


def identity_unverifiable() -> str:
    """Why this deployment cannot verify who is calling, or "" when it can (or need not).

    Found for the 10× program (`docs/TENX_PROGRAM_2026-11-05.md` §1.3, Track A2): with
    ``PRAMANYX_REQUIRE_IDENTITY=1`` and no issuer, the transitional headers WERE the identity —
    anyone on the port could name any organisation and, being its first caller, become its
    owner — and nothing said so. So the combination is refused, per request, with this
    sentence (``api._require_auth``), and said again at boot, on ``/health``, on
    ``/auth/config`` and by ``pramanyx doctor``. The one legitimate form of the seam is the
    declared one: :data:`IDENTITY_FROM_PROXY_ENV`.
    """
    if not require_identity_enabled():
        return ""
    from pramanyx.security import oidc
    if oidc.configured() or identity_from_proxy():
        return ""
    return ("identity is required (PRAMANYX_REQUIRE_IDENTITY=1) but nothing here can verify who is "
            "calling: set PRAMANYX_OIDC_ISSUER and PRAMANYX_OIDC_AUDIENCE to verify sign-ins, or set "
            f"{IDENTITY_FROM_PROXY_ENV}=1 only if an authenticating proxy in front of this API sets "
            f"{IDENTITY_ORG_HEADER} and {IDENTITY_USER_HEADER} and strips them from clients. Until "
            "then every request but /health and /auth/config is refused.")


def resolve_principal(request: Request) -> Optional[Principal]:
    """Resolve the calling principal from the request, or None if no identity is
    presented. Never raises — the org middleware calls this outside FastAPI's
    exception handling, so an invalid credential resolves to None and the 401
    (with its reason) is ``_require_auth``'s to give.

    Order matters and is load-bearing:

    1. A JWT-shaped OIDC bearer, when an issuer is configured — VERIFIED identity.
       An invalid one resolves to nothing rather than falling through: a caller
       who presented a bad token must not be quietly downgraded to the header seam.
       Or the session cookie that token was exchanged for (``security/sessions.py``,
       Track A9) — the same verification, deferred; the same fail-closed answer.
    2. While OIDC is configured AND identity is required, the header seam is DEAD —
       otherwise `X-Pramanyx-User: mallory` would still work beside real tokens,
       which is the exact hole VA-10 exists to close.
    3. The transitional ``X-Pramanyx-*`` headers — as a LABEL while identity is off (who a
       write is recorded under), and as a credential only where the operator declared a
       proxy sets them (:func:`identity_from_proxy`). Required and undeclared, the seam is
       dead here too, and ``_require_auth`` refuses the request with the reason.
    """
    from pramanyx.security import oidc, service_principals

    # 0. Phase 7 of the 2027 study — a service principal (an outside vendor's agent) presents its name
    #    and key; a presented credential that does not match resolves to NOTHING and never falls
    #    through to a weaker seam.
    if service_principals.headers_present(request):
        return service_principals.resolve(request)

    if oidc.configured():
        try:
            verified = oidc.resolve_verified(request.headers.get("Authorization"))
        except oidc.OidcError as exc:
            from pramanyx.kernel.errors import tolerate
            tolerate(exc, "OIDC bearer refused; resolving no identity (fail closed)",
                     counter="authz.oidc.rejected")
            return None
        if verified is not None:
            return verified
        # 1b. A browser session (Track A9): the cookie `POST /auth/session` minted from a verified
        #     token. Resolved only while an issuer is configured — it is that verification, deferred.
        #     An unknown, expired or revoked cookie resolves NOTHING: no fall-through to the headers.
        from pramanyx.security import sessions
        cookie = request.cookies.get(sessions.COOKIE)
        if cookie:
            return sessions.resolve(cookie)
        if require_identity_enabled():
            return None
    elif require_identity_enabled() and not identity_from_proxy():
        return None
    org = (request.headers.get(IDENTITY_ORG_HEADER) or "").strip()
    if not org:
        return None
    user = (request.headers.get(IDENTITY_USER_HEADER) or "anonymous").strip()
    return Principal(user_id=user, org_id=org)


def get_principal(request: Request) -> Optional[Principal]:
    """FastAPI dependency: the principal bound to this request by ``_require_auth``
    (None in localhost / identity-off mode)."""
    return getattr(request.state, "principal", None)


def local_operator() -> str:
    """The person an install without sign-in acts for: whoever is logged in to the computer it runs
    on (``PRAMANYX_LOCAL_USER`` names someone else). One person's install has one operator, and their
    login is the credential they already presented."""
    named = (os.environ.get("PRAMANYX_LOCAL_USER") or "").strip()
    if named:
        return named
    try:
        # The ACCOUNT the process runs under, not `getpass.getuser()`, which reads LOGNAME first:
        # a launcher that sets LOGNAME=root recorded a person's approvals as root (2026-10-07).
        import pwd
        return pwd.getpwuid(os.getuid()).pw_name or "local operator"
    except (ImportError, KeyError) as exc:
        from pramanyx.kernel.errors import tolerate
        tolerate(exc, "no account database here (Windows); the session's login name is read instead",
                 counter="authz.local_operator_account")
    try:
        import getpass
        return getpass.getuser() or "local operator"
    except Exception as exc:  # noqa: BLE001 — no login name on this host
        from pramanyx.kernel.errors import tolerate
        tolerate(exc, "the computer's login could not be read; the install's operator is unnamed",
                 counter="authz.local_operator")
        return "local operator"


def resolve_actor(request: Request) -> str:
    """Who this request acts for — the person every write it makes is recorded under.

    The signed-in person (a verified sign-in, a service principal, the self-host header) when one
    is presented, whether or not identity is ENFORCED: enforcement decides who may call, while the
    record of who did something should name them either way. Otherwise this install's own login.
    Never anything from the request body — a name typed into a form is not who is signed in."""
    principal = getattr(getattr(request, "state", None), "principal", None) or resolve_principal(request)
    user = str(getattr(principal, "user_id", "") or "").strip()
    if user and user != "anonymous":
        return user
    return local_operator()


def caller() -> str:
    """The person a route's write is recorded under: the one this request acts for, else this
    install's operator (a route mounted without the API's middleware, as a test mounts one)."""
    from pramanyx.org.context import current_actor
    return current_actor() or local_operator()


def acting_person(principal, named: str = "") -> str:
    """Who a write is recorded under, as ``user:<id>``: the identified caller, else the person the
    request acts for (`caller` — the one this request acts for, or this install's operator). ``named``
    — a name a form or a client sent — is NOT read: who did something is who is signed in, never a
    name somebody typed, and the old fallback recorded ``person:<anything>`` (and passed
    ``user:ceo`` through as written)."""
    for attr in ("user_id", "email", "id", "sub", "name"):
        v = getattr(principal, attr, "") if principal is not None else ""
        if v:
            return f"user:{v}"
    return f"user:{caller()}"


# ── Ownership resolution: resource → connection → org ────────────────────────────

class Ownership(str, Enum):
    """What a resource is to a principal — five answers, because ``None`` used to be four of them.

    Until Track A4 (2026-11-05, `docs/TENX_PROGRAM_2026-11-05.md` §1.1) the resolver returned an
    org id or ``None``, and ``None`` meant a shared builtin, a missing id, a kind with no resolver
    registered, or a resolver that raised — and every one of them was ALLOWED. The rule here is
    "unknown is not empty": a check that
    cannot answer raises rather than returning an empty or a full answer. Only the first two allow.
    """
    OWNED = "owned"            #: the principal's own organisation owns it
    SHARED = "shared"          #: a shared builtin, or a resource that belongs to no organisation BY RECORD
    FOREIGN = "foreign"        #: another organisation's
    NOT_FOUND = "not_found"    #: no such resource — said here, before the door's own 404
    UNRESOLVED = "unresolved"  #: no resolver for the kind, or the resolver failed — refused, never guessed


#: What a resolver says about a resource: ``("org", <id>)``, ``("shared", None)`` or ``("missing", None)``.
_Owner = tuple[str, Optional[str]]

#: The prefix an ontology-domain id carries where a connection id is expected. The same string as
#: ``pramanyx.ontology.overrides.DOMAIN_CARRIER`` — spelled here because the platform must not import the
#: agent (`tests/unit/test_platform_agent_boundary.py`); `test_ownership_is_five_valued` holds the two equal.
DOMAIN_CARRIER = "domain:"


def _connection_owner(conn_id: Optional[str]) -> _Owner:
    """A connection's owner by RECORD: its ``org_id`` when it has one; shared when it is a builtin (same id
    on every install) or a saved connection with no organisation; missing when nothing holds that id."""
    if not conn_id:
        return ("missing", None)
    # A ``domain:<name>`` id names an organisation's own ontology domain, read inside the caller's org
    # context, not a connection: there is no row to own, and the org binding is the boundary. Shared,
    # by the record that the id carries its kind.
    if conn_id.startswith(DOMAIN_CARRIER):
        return ("shared", None)
    from pramanyx.db.registry import get_connection_org, is_registered
    org = get_connection_org(conn_id)
    if org:
        return ("org", org)
    return ("shared", None) if is_registered(conn_id) else ("missing", None)


def _owner_of(kind: str, resource_id: str) -> _Owner:
    """Who owns a resource, through its connection — ``connections`` is the one table that carries
    ``org_id`` (DATA-06), and monitors, alerts and brief subscriptions all key by ``conn_id``, so the
    resolution is uniform. Raises when it cannot answer; the caller says so."""
    if kind == "connection":
        return _connection_owner(resource_id)
    if kind == "canvas":
        from pramanyx.canvas.store import resolve_connection_id
        conn_id = resolve_connection_id(resource_id)
        return _connection_owner(conn_id) if conn_id else ("missing", None)
    if kind == "investigation":
        from pramanyx.db.history import get_investigation
        inv = get_investigation(resource_id)
        if inv is None:
            return ("missing", None)
        conn_id = inv.get("connection_id")
        return _connection_owner(conn_id) if conn_id else ("shared", None)
    if kind == "saved_query":
        from pramanyx.savedquery.store import get_saved_query
        q = get_saved_query(resource_id)
        if q is None:
            return ("missing", None)
        return _connection_owner(q.connection_id) if q.connection_id else ("shared", None)
    # Agent-owned resources live in agent stores the platform must not import — the Agent
    # registers resolvers in the registry at bootstrap. A resource that carries its OWN owner
    # (a document, PENDING item 16: an upload belongs to the org that indexed it, a schema doc
    # to its connection's org, a shared builtin's to none — "") resolves straight to its org;
    # the rest (monitor / alert / brief subscription) resolve to a connection, and conn→org
    # here. A kind nobody registered a resolver for is UNRESOLVED, not allowed: the bare
    # platform cannot own-check an agent's resource, and saying so beats guessing.
    from pramanyx.kernel.registries import resource_org as _rreg
    if _rreg.resolves_org(kind):
        org = _rreg.resolve_resource_org(kind, resource_id)
        if org is None:
            return ("missing", None)
        return ("org", org) if org else ("shared", None)
    if not _rreg.resolves_conn(kind):
        raise LookupError(f"no ownership resolver is registered for {kind!r}")
    conn_id = _rreg.resolve_resource_conn(kind, resource_id)
    return _connection_owner(conn_id) if conn_id else ("missing", None)


def resolve_ownership(kind: str, resource_id: Optional[str], principal: Optional[Principal]) -> Ownership:
    """What ``resource_id`` is to ``principal``. ``OWNED`` in localhost mode (``principal is None``: identity
    is not enforced and one operator owns everything). A resolver that raises is ``UNRESOLVED`` — logged,
    counted, and never read as either empty or shared."""
    if principal is None:
        return Ownership.OWNED
    if not resource_id:
        return Ownership.NOT_FOUND
    try:
        state, org = _owner_of(kind, resource_id)
    except Exception as exc:  # noqa: BLE001 — any failure to answer is the same answer: refuse
        from pramanyx.kernel.errors import tolerate
        tolerate(exc, f"ownership of {kind} {resource_id!r} could not be resolved; refusing",
                 counter=f"authz.unresolved.{kind}")
        return Ownership.UNRESOLVED
    if state == "org":
        return Ownership.OWNED if org == principal.org_id else Ownership.FOREIGN
    if state == "shared":
        return Ownership.SHARED
    return Ownership.NOT_FOUND


def authorize_resource(kind: str, resource_id: Optional[str], principal: Optional[Principal]) -> bool:
    """True if ``principal`` may act on the resource: it is theirs, or shared by record. Nothing else —
    not a missing id, not a kind without a resolver, not a resolver that failed (Track A4)."""
    return resolve_ownership(kind, resource_id, principal) in (Ownership.OWNED, Ownership.SHARED)


def check_owner(kind: str, resource_id: Optional[str], principal: Optional[Principal]) -> None:
    """Refuse unless ``principal`` may act on the resource; no-op in localhost mode.

    Each refusal says which it is: 403 for another organisation's, 404 for one that is not here, 503 for
    one whose owner could not be resolved — the last is an outage to fix, not a missing id, and a 404
    there would send someone looking for a resource that exists."""
    _refuse(kind, resolve_ownership(kind, resource_id, principal))


def refuse_if_foreign(kind: str, resource_id: Optional[str], principal: Optional[Principal]) -> None:
    """``check_owner`` for an id the door itself may not hold yet: refuse another organisation's (403) and one whose
    owner cannot be resolved (503), and let an id nothing holds through to the door, which says "not here" its own
    way. For ids a caller SENDS rather than addresses: a request body names connections and canvases a door may be
    about to create, and a run that is still streaming has no saved investigation to resolve. Never weaker than what
    such a door asked before, which was nothing."""
    state = resolve_ownership(kind, resource_id, principal)
    if state is not Ownership.NOT_FOUND:
        _refuse(kind, state)


def _refuse(kind: str, state: Ownership) -> None:
    if state in (Ownership.OWNED, Ownership.SHARED):
        return
    if state is Ownership.FOREIGN:
        raise HTTPException(status_code=403, detail=f"forbidden: {kind} belongs to another org")
    if state is Ownership.NOT_FOUND:
        raise HTTPException(status_code=404, detail=f"no such {kind} here, or not yours")
    raise HTTPException(status_code=503,
                        detail=f"could not resolve who owns this {kind}; refusing rather than guessing")


async def connection_owner_guard(request: Request) -> None:
    """Object-level authz (SEC-05 / DATA-06) for a whole router: every connection a request names — a path or query
    parameter called ``connection_id``, ``conn_id`` or ``connection``, or ending in ``_connection_id`` (a comparison's
    ``reference_connection_id``) — must belong to the caller's org. Wired as a router-level dependency, so a door added
    to that router later is covered without anyone remembering to. A no-op in localhost mode (identity off), and for a
    shared builtin or an id that is no registered connection: both resolve no org, and a missing one is the door's own
    404 — exactly ``check_owner``'s contract everywhere else.

    ``connection`` is read since Arc FA (FA-7): ``GET /ask/context`` and ``DELETE /metrics/{name}`` name theirs so, and
    with identity on neither asked whose it was — the same spellings the agent gate reads (``rbac/agent_gate``).

    A JSON BODY's top-level fields are read too, since 2026-11-08, under the same names plus ``canvas_id``. Until then
    this guard saw only the path and the query, and each door that took its connection in a body was to check it
    itself; ``/query/*`` did, and ``POST /ask`` and ``POST /chat`` did not, so with identity on they answered
    questions about another organisation's connection (found by the nightly eval's org-denial set, PENDING F1). A body
    id passes :func:`refuse_if_foreign`, not ``check_owner``: a body may name something its door is about to create."""
    principal = get_principal(request)
    if principal is None:
        return
    addressed = [*request.path_params.items(), *request.query_params.multi_items()]
    sent = await _json_body(request)
    from starlette.concurrency import run_in_threadpool
    # The lookups are store reads; off the event loop, where this guard ran while it was a plain function.
    await run_in_threadpool(_check_named_connections, addressed, sent, principal)


def _names_a_connection(name: str) -> bool:
    return name in CONNECTION_PARAMS or name.endswith("_connection_id")


def _check_named_connections(addressed: list, sent: dict, principal: Principal) -> None:
    for name, value in addressed:
        if value and _names_a_connection(name):
            check_owner("connection", value, principal)
    for name, value in sent.items():
        if not value or not isinstance(value, str):
            continue
        if _names_a_connection(name):
            refuse_if_foreign("connection", value, principal)
        elif name in BODY_RESOURCE_PARAMS:
            refuse_if_foreign(BODY_RESOURCE_PARAMS[name], value, principal)


async def _json_body(request: Request) -> dict:
    """A request's JSON body when it has one that is an object, else empty. Read once and cached by Starlette, so
    the door parses the same bytes after this; a body that does not parse is left for the door to refuse."""
    if request.method not in ("POST", "PUT", "PATCH", "DELETE"):
        return {}
    if "json" not in request.headers.get("content-type", "").lower():
        return {}
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001 — a malformed body is the door's 400/422 to say, not this guard's
        return {}
    return body if isinstance(body, dict) else {}


#: The names a path or query parameter carries a connection id under — what :func:`connection_owner_guard` reads.
CONNECTION_PARAMS: tuple[str, ...] = ("connection_id", "conn_id", "connection")

#: Body fields that name a resource reached through its connection, and its kind — a canvas resolves to the
#: connection it sits on (``/ask``, ``/chat``, ``/investigate`` and ``/overview/drill`` answer over it).
BODY_RESOURCE_PARAMS: dict[str, str] = {"canvas_id": "canvas"}


def investigation_owner_guard(request: Request) -> None:
    """Object-level authz for a router whose doors address an investigation by ``inv_id``: another organisation's is
    refused. Added 2026-11-08: cancel, resume (``/feedback``), evidence and its feedback, outcomes, a recommendation's
    outcome and execution, and the two receipts never asked whose investigation they acted on, while the seven doors
    beside them each called ``check_owner`` itself. ``refuse_if_foreign``: a run that is still streaming may not be
    saved yet, and cancelling it must still work."""
    principal = get_principal(request)
    if principal is None:
        return
    if (inv_id := request.path_params.get("inv_id")):
        refuse_if_foreign("investigation", inv_id, principal)


# ── Read-path tenancy: org-scope list/read endpoints ─────────────────────────────

def tenant_scope() -> Optional[str]:
    """The org id a cross-tenant STORE READ must filter by, or ``None`` for no filter.

    The companion to :func:`org_visible_conn_ids` for stores that carry their own
    ``org_id`` column (the audit log, session events): filter on the tenant the row was
    WRITTEN with rather than on the set of connections that happen to be registered now.
    The difference is not cosmetic — a local audit log holds 8,558 rows whose connection
    has since been deleted, and a scope derived from the live registry would re-expose
    every one of them.

    ``None`` exactly when identity is off, which is what keeps single-tenant installs
    byte-identical: there, one tenant owns every row and a filter could only remove the
    operator's own history.
    """
    if not require_identity_enabled():
        return None
    from pramanyx.org.context import current_org_id
    return current_org_id() or None


def org_visible_conn_ids() -> Optional[set[str]]:
    """The connection ids visible to the current request's org, or ``None`` (no org
    filter) in localhost / identity-off mode — DATA-06 read-path scoping.

    Monitors, alerts, brief subscriptions and canvases are all keyed by ``conn_id``
    and carry no ``org_id`` of their own; a connection's org is the tenant boundary.
    Restricting a list to the org's connections therefore org-scopes every one of
    them, consistent with ``list_investigations``'s ``WHERE org_id`` clause. Relies on
    ``current_org_id()`` being bound for the request by ``_OrgContextMiddleware``.
    """
    if not require_identity_enabled():
        return None
    from pramanyx.db.registry import list_connections
    # list_connections() is itself org-filtered when identity is on (registry.py).
    return {c["id"] for c in list_connections()}
