"""Track A5 (docs/TENX_PROGRAM_2026-11-05.md): an organisation's first owner is a named, verified person.

Measured before: the header seam with an org and no user resolved to ``anonymous``, and the first
such request made "anonymous" the owner — so every later user-less request owned the org. And a
service principal, an outside vendor's agent, could be an organisation's first caller and be made
its administrator. Neither is a person; neither bootstraps. The organisation stays claimable by
its first named person, because a refused bootstrap is not cached as "checked".
"""
from __future__ import annotations

from pramanyx.rbac import resolver
from pramanyx.rbac.roles import OWNER
from pramanyx.rbac.store import roles_for_user
from pramanyx.security.authz import Principal
from pramanyx.security.service_principals import PREFIX


def test_anonymous_and_service_principals_never_bootstrap(monkeypatch):
    monkeypatch.setenv("PRAMANYX_RBAC_AUTO_BOOTSTRAP", "1")
    resolver._reset_bootstrap_cache()
    org = "a5-org"
    assert resolver.maybe_bootstrap_owner(Principal(user_id="anonymous", org_id=org)) is False
    assert resolver.maybe_bootstrap_owner(Principal(user_id="", org_id=org)) is False
    assert resolver.maybe_bootstrap_owner(Principal(user_id=f"{PREFIX}vendor-bot", org_id=org)) is False
    assert roles_for_user(org, "anonymous") == [] and roles_for_user(org, f"{PREFIX}vendor-bot") == []
    # The org was not marked checked: its first named person still claims it.
    assert resolver.maybe_bootstrap_owner(Principal(user_id="amit", org_id=org)) is True
    assert roles_for_user(org, "amit") == [OWNER]
    # And only once.
    assert resolver.maybe_bootstrap_owner(Principal(user_id="mallory", org_id=org)) is False
    assert roles_for_user(org, "mallory") == []


def test_over_http_an_anonymous_first_caller_is_a_viewer(client, monkeypatch):
    monkeypatch.setenv("PRAMANYX_REQUIRE_IDENTITY", "1")
    monkeypatch.setenv("PRAMANYX_RBAC_AUTO_BOOTSTRAP", "1")
    resolver._reset_bootstrap_cache()
    nobody = {"X-Pramanyx-Org": "a5-http-org"}                 # no X-Pramanyx-User → "anonymous"
    assert client.get("/rbac/me", headers=nobody).json()["roles"] == ["viewer"]
    assert client.get("/rbac/assignments", headers=nobody).status_code == 403
    someone = {"X-Pramanyx-Org": "a5-http-org", "X-Pramanyx-User": "amit"}
    assert client.get("/rbac/me", headers=someone).json()["roles"] == [OWNER]
