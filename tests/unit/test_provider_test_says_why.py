"""Settings' "Test connection" tests what is on the form, and a refusal says the provider's own words (2026-11-09).

Found when an added NVIDIA NIM "would not work": the test sent the provider picked on the form but never the models
picked beside it, so a provider not yet saved was answered "no model configured" and nothing was sent; and when a
model WAS named, NVIDIA's 403 was said as our own hint ("the client could not be built") with none of NVIDIA's words,
and a retired model's 410 Gone as "the model returned no content".
"""
from __future__ import annotations

import pytest

from pramanyx.llm import provider as P
from pramanyx.llm.reliability import UNAVAILABLE, Diagnosis, StructuredOutputError, _unavailable_detail


class _Said(Exception):
    """A provider's HTTP error as the OpenAI client raises it: a status and the provider's body."""

    def __init__(self, status: int, message: str):
        super().__init__(f"Error code: {status} - {message}")
        self.status_code = status
        self.message = f"Error code: {status} - {message}"
        self.body = {"error": {"message": message}}


def _wrapped(cause: Exception) -> StructuredOutputError:
    detail = _unavailable_detail("bad_key", cause)
    err = StructuredOutputError(Diagnosis(UNAVAILABLE, detail, ""), cause)
    err.__cause__ = cause
    return err


def test_the_form_s_models_are_tested_for_a_provider_not_yet_saved(monkeypatch):
    pinged: list[tuple] = []
    monkeypatch.setattr(P, "backends", lambda: (*P.BACKENDS, "nvidia-nim"))
    monkeypatch.setattr(P, "_active_backend", lambda: "anthropic")
    monkeypatch.setattr(P, "_ping_cached", lambda b, m, role="coder", force=False:
                        pinged.append((b, m, role)) or {"model": m, "ok": True, "ms": 1.0})
    out = P.test_provider(backend="nvidia-nim", models={"coder": "z-ai/glm-5.3-flash", "narrator": "z-ai/glm-5.3-flash",
                                                        "fast": "", "bogus": "x"})
    assert out["ok"] is True and out["tested"] == 1, out
    assert pinged == [("nvidia-nim", "z-ai/glm-5.3-flash", "coder")]
    assert out["results"][0]["used_by"] == ["coder", "narrator"]
    # without the form's models, a provider not yet saved still says plainly that nothing was tested
    none = P.test_provider(backend="nvidia-nim")
    assert none["ok"] is False and none["tested"] == 0 and "no model configured" in none["error"]


def test_a_refused_key_is_a_bad_key_said_in_the_provider_s_words():
    forbidden = _Said(403, "Authorization failed for this key")
    err = _wrapped(forbidden)
    assert P.classify_provider_error(err) == "bad_key"            # not "config: the client could not be built"
    assert "Authorization failed for this key" in str(err)        # the diagnosis carries the provider's words


def test_a_retired_model_is_a_model_the_provider_does_not_serve():
    gone = _Said(410, "The model 'meta/llama-3.1-8b-instruct' has reached its end of life")
    assert P.classify_provider_error(gone) == "model_not_found"
    assert P._is_model_not_found(gone)


#: A provider's own sentence is often long; the part that says why can sit past what a wrapper's text is cut to.
_LONG = "Forbidden: " + "the request was refused for this account; " * 4

@pytest.mark.parametrize("status, words, reason", [
    (403, _LONG + "Authorization failed", "bad_key"),
    (410, _LONG + "This model has reached its end of life", "model_not_found"),
])
def test_the_ping_says_the_provider_s_own_words(monkeypatch, status, words, reason):
    class _Prov:
        _client, _model = object(), "m"

        def __init__(self, *a, **k):
            pass

        def _complete_on(self, *a, **k):
            raise _wrapped(_Said(status, words))

    monkeypatch.setattr(P, "LLMProvider", _Prov)
    got = P._ping("nvidia-nim", "m")
    assert got["ok"] is False and got["reason"] == reason, got
    assert words.split("; ")[-1] in got["error"], got          # the provider's reason, never cut off by our wrapping
