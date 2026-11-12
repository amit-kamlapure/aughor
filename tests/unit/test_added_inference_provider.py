"""A person adds an inference provider in Settings ▸ Inference, and OpenAI is a built-in one (2026-11-09).

The user, that morning: "Silly enough, user cannot add an inference provider in the platform?" The provider list was a
hard-coded tuple of seven; OpenAI was not among them, and nothing let a person point the platform at another
OpenAI-compatible endpoint (Azure OpenAI, Mistral, DeepSeek, xAI, a keyed vLLM). The live install's Anthropic balance
was spent, and it was answering on an OpenRouter fallback — a second keyed provider mattered that day.

An added provider is not a second mechanism beside the built-ins: it is stored in the same config and joins the one list
(`provider.backends()`), so the role binding, the fallback picker and chain, the catalogue, the health check and an
organisation's own binding reach it as they reach a built-in one. Proved here against a real socket — a tiny
OpenAI-compatible server in the test — so the base URL and the key are seen arriving where they were sent, and nothing
is spent: no request leaves this machine.
"""
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from pydantic import BaseModel

from pramanyx.llm import coordination as C
from pramanyx.llm import models as M
from pramanyx.llm import org_config as OC
from pramanyx.llm import provider as P

SECRET = "sk-added-provider-SECRET-0042"
OTHER_SECRET = "sk-second-provider-SECRET-0077"


class _Ok(BaseModel):
    ok: bool


# ── a tiny OpenAI-compatible server ───────────────────────────────────────────

class _Stub:
    """An OpenAI-compatible endpoint on 127.0.0.1: records every request, answers as told.

    ``reply`` decides each chat completion: ``"ok"`` answers ``{"ok": true}``; ``"spent"`` answers 402 with a spent
    balance (a refusal the fallback chain walks past); ``"refuse_params"`` refuses ``max_tokens`` and any
    temperature the way OpenAI's reasoning models do, until the request is sent as they ask."""

    def __init__(self, reply: str = "ok", models: tuple[str, ...] = ("stub-model-a", "stub-model-b")):
        self.reply = reply
        self.models = models
        self.seen: list[dict] = []
        stub = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_a):          # quiet
                return

            def _send(self, status: int, body: dict) -> None:
                raw = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def _record(self, body: dict | None = None) -> None:
                stub.seen.append({"method": self.command, "path": self.path,
                                  "auth": self.headers.get("Authorization"), "body": body or {}})

            def do_GET(self):  # noqa: N802 — the stdlib's name
                self._record()
                if self.path.endswith("/models"):
                    return self._send(200, {"object": "list",
                                            "data": [{"id": m, "object": "model"} for m in stub.models]})
                return self._send(404, {"error": {"message": "404 page not found"}})

            def do_POST(self):  # noqa: N802
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
                self._record(body)
                if not self.path.endswith("/chat/completions"):
                    return self._send(404, {"error": {"message": "404 page not found"}})
                if stub.reply == "spent":
                    return self._send(402, {"error": {"message": "Insufficient credits. Add more to continue.",
                                                      "type": "insufficient_quota"}})
                if stub.reply == "refuse_params":
                    if "max_tokens" in body:
                        return self._send(400, {"error": {
                            "message": "Unsupported parameter: 'max_tokens' is not supported with this model. "
                                       "Use 'max_completion_tokens' instead.",
                            "type": "invalid_request_error", "param": "max_tokens",
                            "code": "unsupported_parameter"}})
                    if "temperature" in body:
                        return self._send(400, {"error": {
                            "message": "Unsupported value: 'temperature' does not support 0.1 with this model. "
                                       "Only the default (1) value is supported.",
                            "type": "invalid_request_error", "param": "temperature",
                            "code": "unsupported_value"}})
                return self._send(200, {
                    "id": "chatcmpl-stub", "object": "chat.completion", "created": 0, "model": body.get("model"),
                    "choices": [{"index": 0, "finish_reason": "stop",
                                 "message": {"role": "assistant", "content": json.dumps({"ok": True})}}],
                    "usage": {"prompt_tokens": 7, "completion_tokens": 3, "total_tokens": 10}})

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}/v1"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def chats(self) -> list[dict]:
        return [r for r in self.seen if r["path"].endswith("/chat/completions")]

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture
def stubs():
    made: list[_Stub] = []

    def make(**kw) -> _Stub:
        s = _Stub(**kw)
        made.append(s)
        return s
    yield make
    for s in made:
        s.close()


@pytest.fixture(autouse=True)
def cfg(tmp_path, monkeypatch):
    """A config file of the test's own, the catalogue fetch on (the stub is local), no cooldown or refusal carried
    in from another test, and no organisation row left behind."""
    path = tmp_path / "llm_config.json"
    path.write_text("{}")
    original = P._CONFIG_PATH
    P._CONFIG_PATH = path          # restored by hand: the reload must follow the path back
    P.load_config()
    M.clear_cache()
    P._refused_params.clear()
    C.set_default(None)
    monkeypatch.setenv("PRAMANYX_LLM_MODEL_FETCH", "1")
    monkeypatch.delenv("PRAMANYX_FALLBACK_DISABLED", raising=False)
    for org in ("acme", "default"):
        OC.clear_org_config(org)
    yield path
    for org in ("acme", "default"):
        OC.clear_org_config(org)
    P._CONFIG_PATH = original
    P.load_config()
    M.clear_cache()
    P._refused_params.clear()
    C.set_default(None)


def _bind(backend: str, model: str) -> None:
    P.set_config({"backend": backend, "models": {"coder": model, "narrator": model, "fast": model}})


# ── OpenAI, built in ──────────────────────────────────────────────────────────

def test_openai_is_a_built_in_keyed_provider_on_its_own_api(monkeypatch):
    assert "openai" in P.BACKENDS and "openai" in P.NEEDS_KEY and "openai" in P.backends()
    assert P._KEY_ENV["openai"] == "OPENAI_API_KEY"
    _bind("openai", "a-model-the-person-picked")
    backend, model, base_url = P.resolve_binding("coder")
    assert (backend, model, base_url) == ("openai", "a-model-the-person-picked", "https://api.openai.com/v1")
    # The key is set where every key is set, and the client is built on OpenAI's own address with it.
    P.set_config({"keys": {"openai": SECRET}})
    built: list = []
    monkeypatch.setattr(P, "_build_openai_compat", lambda url, key: built.append((url, key)) or object())
    P.LLMProvider("openai", "coder")
    assert built == [("https://api.openai.com/v1", SECRET)]
    assert P.endpoint_for("openai") == ("https://api.openai.com/v1", SECRET)
    # No model ships for it: an unbound role is refused by name, never guessed.
    assert P.default_models("openai") == {}
    cap = P.current_config()["capabilities"]["coder"]
    assert cap["privacy_class"] == "public_api" and cap["cost"] == "per_token"


def test_openai_joins_the_default_fallback_order_last():
    assert P._FALLBACK_ORDER[-1] == "openai"


# ── add a provider, and a call bound to it is answered by it ─────────────────

def test_a_call_bound_to_an_added_provider_is_answered_by_it(stubs):
    stub = stubs()
    cfg = P.add_provider("Mistral", stub.url, api_key=SECRET, models=["mistral-large-latest"])
    assert "mistral" in cfg["backends"]
    _bind("mistral", "mistral-large-latest")

    out = P.get_provider("coder").complete("You are a test.", "Say ok.", _Ok)

    assert out.ok is True
    (chat,) = stub.chats()
    assert chat["auth"] == f"Bearer {SECRET}"                     # the key reached the client
    assert chat["body"]["model"] == "mistral-large-latest"         # the person's model, at the person's address
    assert P.answered_by() == ("mistral", "mistral-large-latest", False)


def test_a_keyless_endpoint_is_sent_no_key_and_never_the_environments(stubs, monkeypatch):
    """An empty key is allowed (a keyless vLLM). The OpenAI client, handed no key, reads OPENAI_API_KEY — which would
    have sent this deployment's OpenAI key to somebody else's endpoint."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-the-deployments-own-openai-key")
    stub = stubs()
    P.add_provider("Local vLLM", stub.url)
    _bind("local-vllm", "served-model")
    P.get_provider("coder").complete("You are a test.", "Say ok.", _Ok)
    (chat,) = stub.chats()
    assert chat["auth"] == f"Bearer {P._KEYLESS}"
    assert "sk-the-deployments-own-openai-key" not in json.dumps(stub.seen)
    assert P.current_config()["providers"][0]["key_state"] == "unset"


def test_the_catalogue_lists_what_the_added_provider_serves(stubs, client):
    stub = stubs(models=("served-a", "served-b"))
    P.add_provider("Fireworks", stub.url, api_key=SECRET, models=["typed-by-hand"])
    r = client.get("/llm/models", params={"backend": "fireworks", "refresh": "true"})
    assert r.status_code == 200, r.text
    ids = [m["id"] for m in r.json()["models"]]
    assert ids == ["served-a", "served-b", "typed-by-hand"]
    assert r.json()["live"] is True
    (listing,) = [s for s in stub.seen if s["path"].endswith("/models")]
    assert listing["auth"] == f"Bearer {SECRET}"


def test_test_connection_reaches_the_added_provider_and_no_other(stubs, client):
    stub = stubs()
    P.add_provider("DeepSeek", stub.url, api_key=SECRET)
    _bind("deepseek", "deepseek-chat")
    r = client.post("/llm/config/test", json={"backend": "deepseek", "force": True})
    assert r.status_code == 200
    assert r.json()["ok"] is True and r.json()["tested"] == 1
    assert [c["body"]["model"] for c in stub.chats()] == ["deepseek-chat"]


def test_an_added_providers_privacy_is_said_in_the_direction_that_cannot_mislead(stubs):
    from pramanyx.control_plane.inference import capability_for
    stub = stubs()
    P.add_provider("On this box", stub.url)
    P.add_provider("xAI", "https://api.x.ai/v1", api_key=SECRET)
    assert capability_for("on-this-box", "m", "coder", stub.url).privacy_class == "local"
    assert capability_for("xai", "m", "coder", "https://api.x.ai/v1").privacy_class == "public_api"


# ── the fallback reaches it ───────────────────────────────────────────────────

def test_the_fallback_chain_reaches_an_added_provider(stubs, monkeypatch):
    monkeypatch.delenv("PRAMANYX_FALLBACK_BACKENDS", raising=False)     # the Settings choice, not the suite's pin
    primary, second = stubs(reply="spent"), stubs()
    P.add_provider("Primary Co", primary.url, api_key=SECRET)
    P.add_provider("Second Co", second.url, api_key=OTHER_SECRET)
    _bind("primary-co", "primary-model")
    P.set_config({"fallback": {"backend": "second-co", "model": "second-model"}})
    assert P.current_config()["fallback"]["chain"] == ["second-co"]

    out = P.get_provider("coder").complete("You are a test.", "Say ok.", _Ok)

    assert out.ok is True
    assert len(primary.chats()) == 1                                  # the primary was asked, and refused
    (answered,) = second.chats()
    assert answered["auth"] == f"Bearer {OTHER_SECRET}"               # the fallback's OWN key, not the primary's
    assert answered["body"]["model"] == "second-model"
    assert P.answered_by() == ("second-co", "second-model", True)


def test_a_keyed_added_provider_joins_the_default_order_and_a_keyless_one_waits_to_be_chosen(stubs, monkeypatch):
    monkeypatch.delenv("PRAMANYX_FALLBACK_BACKENDS", raising=False)
    P.add_provider("Keyed Co", stubs().url, api_key=SECRET)
    P.add_provider("Keyless Co", stubs().url)
    chain = P._fallback_backends()
    assert chain[: len(P._FALLBACK_ORDER)] == P._FALLBACK_ORDER
    assert "keyed-co" in chain and "keyless-co" not in chain
    P.set_config({"fallback": {"backend": "keyless-co", "model": "m"}})
    assert P._fallback_backends() == ("keyless-co",)


def test_a_byok_org_never_reaches_the_operators_added_provider(stubs, monkeypatch):
    from pramanyx.org.context import using_org
    monkeypatch.delenv("PRAMANYX_FALLBACK_BACKENDS", raising=False)
    P.add_provider("Operator Co", stubs().url, api_key=SECRET)
    _bind("ollama", "local-model")
    P.set_config({"fallback": {"backend": "operator-co", "model": "m"}})
    OC.save_org_config("acme", {"backend": "openrouter", "keys": {"openrouter": "sk-acme-own"}})
    with using_org("acme"):
        prov = P.LLMProvider.__new__(P.LLMProvider)
        prov.backend, prov.role = "openrouter", "coder"
        assert prov._fallback_candidates() == []                      # the operator's endpoint is the operator's spend


# ── a name must not collide ───────────────────────────────────────────────────

@pytest.mark.parametrize("name, says", [
    ("OpenAI", "built-in provider (openai)"),
    ("open ai", "built-in provider (openai)"),
    ("LM-Studio", "built-in provider (lmstudio)"),
    ("none", "cannot name a provider"),
    ("faux", "cannot name a provider"),
    ("!!!", "no letter or digit"),
    ("", "needs a name"),
    ("x" * 41, "at most 40 characters"),
])
def test_a_name_that_collides_or_names_nothing_is_refused_with_a_sentence(name, says):
    with pytest.raises(ValueError, match=r"(?i)" + says.replace("(", r"\(").replace(")", r"\)")):
        P.add_provider(name, "https://api.example.com/v1")
    assert P.added_providers() == {}


def test_a_second_provider_of_the_same_name_is_refused(client):
    assert client.post("/llm/providers", json={"name": "Mistral", "base_url": "https://api.mistral.ai/v1"}
                       ).status_code == 200
    for again in ("Mistral", "MISTRAL", " mistral "):
        r = client.post("/llm/providers", json={"name": again, "base_url": "https://elsewhere.example/v1"})
        assert r.status_code == 400
        assert "is taken — a provider named 'Mistral' was already added" in r.json()["detail"]
    assert P.added_providers() == {"mistral": {"name": "Mistral", "base_url": "https://api.mistral.ai/v1"}}


def test_a_base_url_that_names_no_host_is_refused():
    with pytest.raises(ValueError, match="must start with http:// or https://"):
        P.add_provider("Mistral", "api.mistral.ai/v1")


# ── the key never leaves the server ───────────────────────────────────────────

def test_the_key_appears_in_no_response(stubs, client):
    stub = stubs()
    added = client.post("/llm/providers", json={"name": "Azure OpenAI", "base_url": stub.url,
                                                 "api_key": SECRET, "models": ["gpt-deployment"]})
    stored = json.loads(P.config_path().read_text())["keys"]["azure-openai"]
    assert stored != SECRET                                            # encrypted at rest
    _bind("azure-openai", "gpt-deployment")
    OC.save_org_config("acme", {"backend": "azure-openai", "keys": {"azure-openai": OTHER_SECRET}})
    responses = [
        added,
        client.get("/llm/config"),
        client.put("/llm/providers/azure-openai", json={"models": ["gpt-deployment", "another"]}),
        client.get("/llm/models", params={"backend": "azure-openai"}),
        client.post("/llm/config/test", json={"backend": "azure-openai", "force": True}),
        client.get("/org-settings/llm"),
        client.get("/health"),
        client.delete("/llm/providers/azure-openai"),
    ]
    for r in responses:
        assert r.status_code == 200, (r.request.url, r.text)
        for secret in (SECRET, OTHER_SECRET, stored):
            assert secret not in r.text, f"{r.request.method} {r.request.url.path} returned a key"
    described = added.json()["providers"][0]
    assert described == {"id": "azure-openai", "name": "Azure OpenAI", "base_url": stub.url,
                         "models": ["gpt-deployment"], "key_state": "set"}


# ── edit ──────────────────────────────────────────────────────────────────────

def test_an_edit_moves_the_address_replaces_the_models_and_can_drop_the_key(stubs):
    old, new = stubs(), stubs()
    P.add_provider("Together Two", old.url, api_key=SECRET, models=["a"])
    P.update_provider("together-two", base_url=new.url, models=["b", "c"])
    _bind("together-two", "b")
    P.get_provider("coder").complete("You are a test.", "Say ok.", _Ok)
    assert old.chats() == [] and new.chats()[0]["auth"] == f"Bearer {SECRET}"
    assert P.current_config()["providers"][0]["models"] == ["b", "c"]
    P.update_provider("together-two", api_key="••••••••")            # a masked key is "unchanged"
    assert P.current_config()["providers"][0]["key_state"] == "set"
    P.update_provider("together-two", api_key="")                     # "" = the endpoint takes none
    assert P.current_config()["providers"][0]["key_state"] == "unset"


def test_a_built_in_provider_is_not_edited_or_removed_here(client):
    r = client.delete("/llm/providers/openai")
    assert r.status_code == 400 and "is a built-in provider" in r.json()["detail"]


# ── remove ────────────────────────────────────────────────────────────────────

def test_removing_one_clears_what_named_it_and_says_so(stubs, monkeypatch):
    monkeypatch.delenv("PRAMANYX_FALLBACK_BACKENDS", raising=False)
    first, second = stubs(), stubs()
    P.add_provider("First Co", first.url, api_key=SECRET, models=["f-model"])
    P.add_provider("Second Co", second.url, api_key=OTHER_SECRET)
    _bind("first-co", "f-model")
    P.set_config({"fallback": {"backend": "second-co", "model": "s-model"},
                  "json_mode": {"first-co": ["f-model"]}})
    OC.save_org_config("acme", {"backend": "second-co", "models": {"coder": "s-model"},
                                "keys": {"second-co": "sk-acme-own"}})

    gone = P.remove_provider("second-co")
    assert gone["removed"] == "second-co"
    assert "The fallback was Second Co; it is the built-in order again." in gone["said"]
    assert any("1 organisation ran on Second Co as their own provider (acme)" in s for s in gone["said"])
    cfg = P.current_config()
    assert cfg["fallback"]["backend"] == "" and cfg["fallback"]["model"] == ""
    assert OC.describe_org_config("acme")["backend"] == ""
    assert OC.describe_org_config("acme")["models"] == {}
    assert "second-co" not in OC.describe_org_config("acme")["keys_set"]

    gone = P.remove_provider("first-co")
    assert gone["said"][0].startswith("Every role ran on First Co; that binding is cleared, so calls now go to ollama")
    stored = json.loads(P.config_path().read_text())
    assert "backend" not in stored and stored["models"] == {}
    for field in ("providers", "keys", "custom_models", "models_by_backend", "json_mode"):
        assert "first-co" not in (stored.get(field) or {}), field
    assert P.added_providers() == {} and "first-co" not in P.backends()


def test_a_removed_provider_is_refused_with_a_sentence_everywhere_it_is_named(stubs, client):
    P.add_provider("Gone Co", stubs().url, api_key=SECRET)
    assert client.delete("/llm/providers/gone-co").status_code == 200
    sentence = "it is not a provider here"
    for refused in (
        client.post("/llm/config", json={"backend": "gone-co"}),
        client.post("/llm/config", json={"fallback": {"backend": "gone-co"}}),
        client.get("/llm/models", params={"backend": "gone-co"}),
        client.post("/llm/models", json={"backend": "gone-co", "model": "m"}),
        client.put("/llm/providers/gone-co", json={"base_url": "https://x.example/v1"}),
        client.delete("/llm/providers/gone-co"),
        client.put("/org-settings/llm", json={"backend": "gone-co"}),
    ):
        assert refused.status_code == 400, refused.text
        assert sentence in refused.json()["detail"] and "has since been removed" in refused.json()["detail"]
    tested = client.post("/llm/config/test", json={"backend": "gone-co"}).json()
    assert tested["ok"] is False and sentence in tested["error"]
    with pytest.raises(ValueError, match=sentence):
        P.LLMProvider("gone-co", "coder", model="m")


# ── a binding that refuses a parameter is sent it as it asks ──────────────────

def test_a_refused_max_tokens_and_temperature_are_sent_as_the_provider_asks(stubs):
    """OpenAI's reasoning models refuse `max_tokens` and any temperature but their default; read from the provider's
    own 400 (its `param` and `unsupported_*` code), never from a model's name, and paid once per binding."""
    stub = stubs(reply="refuse_params")
    P.add_provider("Reasoner", stub.url, api_key=SECRET)
    _bind("reasoner", "thinking-model")
    assert P.get_provider("coder").complete("You are a test.", "Say ok.", _Ok).ok is True
    sent = [c["body"] for c in stub.chats()]
    assert len(sent) == 3                                              # max_tokens refused, temperature refused, answered
    assert "max_completion_tokens" in sent[-1] and "max_tokens" not in sent[-1] and "temperature" not in sent[-1]

    stub.seen.clear()
    assert P.get_provider("coder").complete("You are a test.", "Again.", _Ok).ok is True
    assert len(stub.chats()) == 1                                      # learned: the next call goes as asked


def test_a_parameter_refusal_is_read_only_from_the_provider_not_from_prose():
    class _Said(Exception):
        def __init__(self, status_code, param, code):
            super().__init__("Unsupported parameter: 'max_tokens'")
            self.status_code, self.param, self.code = status_code, param, code

    assert P._refused_param(_Said(400, "max_tokens", "unsupported_parameter")) == "max_tokens"
    assert P._refused_param(_Said(400, "temperature", "unsupported_value")) == "temperature"
    assert P._refused_param(_Said(400, "messages", "unsupported_value")) == ""     # not one we can send otherwise
    assert P._refused_param(_Said(429, "max_tokens", "unsupported_parameter")) == ""
    assert P._refused_param(RuntimeError("Unsupported parameter: 'max_tokens'")) == ""


# ── an organisation can choose one ────────────────────────────────────────────

def test_an_organisation_chooses_from_the_same_list(stubs):
    P.add_provider("Org Choice", stubs().url)
    described = OC.describe_org_config("acme")
    assert "openai" in described["backends"] and "org-choice" in described["backends"]
    assert described["labels"] == {"org-choice": "Org Choice"}
    assert "org-choice" in described["keyed"]
    OC.save_org_config("acme", {"backend": "org-choice", "keys": {"org-choice": "sk-acme"}})
    assert OC.describe_org_config("acme")["keys_state"] == {"org-choice": "set"}


# ── one list ──────────────────────────────────────────────────────────────────

def test_no_reader_outside_the_provider_asks_the_built_in_tuple_whether_a_provider_exists():
    """`BACKENDS` is the built-in providers only. A reader that asks `b in BACKENDS` whether something is a provider
    here refuses every provider a person added — the second mechanism this change exists not to have. Measured over
    the tree, so a new reader is caught without anyone listing it."""
    import re
    from pathlib import Path

    root = Path(P.__file__).resolve().parents[1]
    asks = re.compile(r"\b(?:not\s+)?in\s+(?:\w+\.)?BACKENDS\b")
    offenders = [f"{path.relative_to(root.parent)}:{n}"
                 for path in root.rglob("*.py") if path.resolve() != Path(P.__file__).resolve()
                 for n, line in enumerate(path.read_text().splitlines(), 1) if asks.search(line)]
    assert offenders == [], "ask provider.backends(), which includes the added providers: " + ", ".join(offenders)


def test_each_refused_parameter_is_a_row_of_its_own_before_the_answer(stubs, monkeypatch):
    """Every attempt is a row (the model-call log, 2026-11-09): the two requests the binding refused for a parameter
    are each in the log as refused, billed nothing, named `parameter_refused` — then the one that answered."""
    from pramanyx import telemetry
    from pramanyx.kernel.ledger import Ledger
    from pramanyx.obs import session_log
    from pramanyx.obs import usage as U

    monkeypatch.setattr(U, "ensure_catalogue_prices", lambda **_k: 0)
    Ledger.default().session_events_clear()
    stub = stubs(reply="refuse_params")
    P.add_provider("Reasoner", stub.url, api_key=SECRET)
    _bind("reasoner", "thinking-model")
    with telemetry.bind_trace("t-params"):
        assert P.get_provider("coder").complete("You are a test.", "Say ok.", _Ok).ok is True
    rows = [e for e in Ledger.default().session_events(trace_id="t-params", ascending=True, limit=50)
            if e["kind"] == session_log.LLM_CALL]
    payloads = [(r.get("payload") or {}) for r in rows]
    refused = [p for p in payloads if p.get("attempt") == "parameter_refused"]
    assert len(refused) == 2 and all(p.get("refused") for p in refused), payloads
    assert [r.get("ok") for r in rows] == [False, False, True], rows
    Ledger.default().session_events_clear()
