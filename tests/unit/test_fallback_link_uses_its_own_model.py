"""A fallback link is sent its OWN model, or it is skipped — never the primary's (punch list 76, 2026-11-09).

`_fallback_provider` handed the constructor `None` when no model was chosen for a link, and the constructor filled the
gap from `_active_model`, which reads the role bindings whatever the backend: the primary's `claude-sonnet-5-5` was sent
to Gemini or Groq, which never served it — a refusal walked as if it were a fallback. `_fallback_model_for` always said
"" means SKIP that link; now it does, and says so.
"""
from __future__ import annotations

import pytest
from pydantic import BaseModel

from pramanyx.llm import coordination as C
from pramanyx.llm import provider as P


class _Out(BaseModel):
    text: str = "ok"


class _Spent(Exception):
    status_code = 400

    def __init__(self):
        super().__init__("Your credit balance is too low to access the Anthropic API.")


@pytest.fixture
def chain(monkeypatch):
    """The primary on Anthropic; the chain Gemini (keyed, no model chosen for it) then OpenRouter (its own model)."""
    cfg = {"backend": "anthropic",
           "models": {"coder": "claude-sonnet-5-5", "narrator": "claude-haiku-5-5", "fast": "claude-haiku-5-5"},
           "fallback": {"backend": "openrouter", "model": "deepseek/deepseek-v4.1-flash"}}
    monkeypatch.setattr(P, "_cfg", lambda: cfg)
    monkeypatch.setattr(P, "_active_key", lambda b: "k")
    monkeypatch.setattr(P, "usable_key", lambda b: "k")
    monkeypatch.setenv("PRAMANYX_FALLBACK_BACKENDS", "gemini,openrouter")
    monkeypatch.delenv("PRAMANYX_FALLBACK_DISABLED", raising=False)
    monkeypatch.delenv("PRAMANYX_FALLBACK_MODEL_GEMINI", raising=False)
    C.set_default(None)
    sent: list[tuple[str, str]] = []

    def fake_complete_on(client, backend, model, system, user, response_model, temperature, **kw):
        sent.append((backend, model))
        if backend == "anthropic":
            raise _Spent()
        return _Out(text=f"{backend}:{model}")

    monkeypatch.setattr(P.LLMProvider, "_complete_on", staticmethod(fake_complete_on))
    prov = P.LLMProvider.__new__(P.LLMProvider)
    prov.backend, prov.role = "anthropic", "coder"
    prov._model, prov._client, prov._base_url = "claude-sonnet-5-5", object(), "a"
    monkeypatch.setattr(prov, "_warn_if_over_window", lambda *a, **k: None)
    yield prov, sent
    C.set_default(None)


def test_a_link_with_no_model_of_its_own_is_skipped_and_the_next_answers(chain):
    prov, sent = chain
    assert prov._fallback_provider("gemini") is None                     # no model chosen for it: skipped
    out = prov.complete("s", "u", _Out, 0.1)
    assert out.text == "openrouter:deepseek/deepseek-v4.1-flash"
    assert ("gemini", "claude-sonnet-5-5") not in sent, "the primary's model id was sent to another vendor"
    assert [b for b, _ in sent] == ["anthropic", "openrouter"], sent


def test_a_link_given_its_own_model_is_sent_that_model(chain, monkeypatch):
    prov, sent = chain
    monkeypatch.setenv("PRAMANYX_FALLBACK_MODEL_GEMINI", "gemini-3.1-flash-lite")
    fb = prov._fallback_provider("gemini")
    assert fb is not None and fb._model == "gemini-3.1-flash-lite"
