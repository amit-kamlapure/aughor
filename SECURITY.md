# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security vulnerability.**

Report it privately through GitHub:

1. Go to the [Security Advisories page](https://github.com/amit-kamlapure/pramanyx/security/advisories/new).
2. Describe the issue, the impact, and the steps to reproduce it.

You should get an acknowledgement within **7 days**. Pramanyx is an alpha project
maintained in someone's spare time, so please be patient with the fix timeline —
but the acknowledgement will be prompt.

If you do not get a response within 7 days, open a public issue that says only
*"awaiting a response on a private security report"* — with no details.

## Supported versions

Pramanyx is pre-1.0 (`0.1.0`) and has no tagged releases yet. Only the `main`
branch receives fixes. There is no long-term-support branch, and no backports.

| Version | Supported |
|---|---|
| `main` | ✅ |
| anything else | ❌ |

## Scope

Pramanyx connects a large language model to a SQL warehouse. That shape carries
inherent risk. The following are **in scope** and worth reporting:

- Bypassing the read-only SQL gate (`pramanyx/sql/readonly.py`, `pramanyx/sql/executor.py`)
  so that a generated query can write, drop, or otherwise mutate data.
- Escaping the per-schema scoping so a query reads tables it was not granted.
- Bypassing the RBAC row policy or the licensing capability gate.
- Extracting stored connection credentials. DSNs and connector secrets are
  encrypted at rest with Fernet (`pramanyx/db/registry.py`); the key file is
  written `0o600`. Anything that recovers plaintext without the key is a finding.
- Prompt injection through *data* — a value inside a warehouse row that causes
  the agent to exfiltrate data or execute unintended SQL.
- Path traversal or SSRF via connector configuration.
- Secret leakage into logs, SSE event streams, or the OpenAPI schema.

## Out of scope

- **The API is unauthenticated by default.** `PRAMANYX_API_KEY` is unset out of
  the box, because Pramanyx is designed as a local single-user tool bound to
  `localhost`. Reporting "the API has no auth" is not a vulnerability — but
  *bypassing the key when one is set* is.
- CORS is restricted to `http://localhost:3000,http://localhost:3001` by default
  and is configurable via `PRAMANYX_CORS_ORIGINS`. Widening it yourself and then
  reporting it is not a finding.
- Vulnerabilities in third-party dependencies that Pramanyx does not reach. Report
  those upstream. If you can show a reachable path through Pramanyx, that *is* in
  scope.
- The LLM producing a wrong answer. Pramanyx has guards for this, but a wrong
  number is a correctness bug, not a security vulnerability — please file it as
  a normal issue.

## Deploying Pramanyx beyond localhost

Pramanyx's defaults assume a trusted, single-user, local environment. Before
exposing it to a network:

- Set `PRAMANYX_API_KEY` to a strong random value. Every request must then carry
  it as `X-Api-Key` (`/health`, `/docs`, `/redoc`, and `/openapi.json` stay open).
- **`GET /slack-bots/runtime` opens only to the deployment's own credentials.** It is the
  one route that returns raw Slack `xoxb-`/`xapp-` tokens (a socket cannot be opened with
  a mask), and handing a credential to anyone but the bot supervisor is giving it away —
  a signed-in person of any organisation included: a bot carries no organisation, and
  the supervisor is one process for the whole deployment. Its RBAC entry alone is not
  enough. You do **not** have to lock the whole API to open it — generate a scoped key in
  **Integrations → Slack → Supervisor key** and give it to the bot supervisor as
  `PRAMANYX_RUNTIME_KEY`. An org-wide `PRAMANYX_API_KEY` satisfies it too. Nothing else is
  affected: automations posting to Slack read the bot from the store server-side and
  never touch that route.
- Set `PRAMANYX_CORS_ORIGINS` to the exact origins you serve. A browser sign-in needs this: the session
  cookie rides only to named origins, and a wildcard keeps the API cookie-less (it says so at boot).
- Terminate TLS in front of the app; Pramanyx speaks plain HTTP.
- **Requiring identity needs something that can verify it.** With `PRAMANYX_REQUIRE_IDENTITY=1`
  and no `PRAMANYX_OIDC_ISSUER`, the API refuses every request but `/health` and `/auth/config`
  (which say why) — before 2026-11-05 it trusted whatever `X-Pramanyx-Org` a client sent, and
  the first caller to name an organisation became its owner. The one deployment where those
  headers are a credential is an authenticating proxy that sets them and strips them from
  clients; declare that with `PRAMANYX_IDENTITY_FROM_PROXY=1`, and nothing else.
- Give the warehouse credential the narrowest read-only grant that works.
