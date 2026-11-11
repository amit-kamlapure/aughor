"""A failure is classified by what the PROVIDER said, never by what the model wrote (2026-11-08, punch list 70).

Every marker the provider's classifiers look for is a provider's wording — "per day", "insufficient_quota", "unknown
model", "429", "retry in 30s". instructor renders each failed attempt's whole completion into its exception's text, and
pydantic's `ValidationError` quotes the value it refused, so a reply that said "orders per day" and failed validation
read as a spent daily allowance: the backend that had just answered went into a 15-minute quota cooldown and out of the
fallback chain. On 2026-11-08, with the primary's credit balance spent, a restored copy of the live install stopped
falling back at all until it was restarted (CP-3's paid comparison).

And the primary's own refusal — Anthropic's "Your credit balance is too low" — matched none of the spent-balance
phrases, so it was probed again on every call instead of cooling down.
"""
from __future__ import annotations

import pytest
from instructor.core.exceptions import InstructorRetryException
from pydantic import BaseModel, ValidationError

from aughor.llm import coordination as C
from aughor.llm import provider as P

#: Words a model may well write — in an investigation spec, an answer, a note — each one a provider marker.
MODEL_WROTE = ("orders per day by region; the daily limit of the warehouse; a rate limit of 429 per minute; "
               "insufficient_quota, add credits; the query timed out; retry in 30s; an invalid model of churn")

ANTHROPIC_SPENT = ("Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': "
                   "'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to "
                   "upgrade or purchase credits.'}}")


class _Spec(BaseModel):
    days: int


def _failed_validation(completion: str = MODEL_WROTE) -> InstructorRetryException:
    """What instructor raises when the model ANSWERED and the answer did not validate."""
    try:
        from instructor.core.exceptions import FailedAttempt
    except ImportError:                                   # pragma: no cover - older instructor
        from instructor.core.retry import FailedAttempt
    try:
        _Spec.model_validate({"days": MODEL_WROTE})
    except ValidationError as refused:
        invalid = refused
    attempt = FailedAttempt(attempt_number=1, exception=invalid, completion=completion)
    return InstructorRetryException(invalid, n_attempts=1, total_usage=0, failed_attempts=[attempt])


class _ProviderSaid(Exception):
    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.status_code = status_code


@pytest.fixture(autouse=True)
def _no_cooldown_leaks():
    C.set_default(None)
    yield
    C.set_default(None)


def test_a_reply_that_failed_validation_is_not_read_as_any_provider_refusal():
    exc = _failed_validation()
    assert MODEL_WROTE[:20] in str(exc)                  # the model's words ARE in the exception's text…
    assert not P._is_quota_exhausted(exc)                # …and none of them is read as the provider's
    assert not P._is_rate_limited(exc)
    assert not P._is_transient(exc)
    assert not P._is_model_not_found(exc)
    assert P._retry_after_seconds(exc) is None
    assert P.classify_provider_error(exc) == "unknown"


def test_the_same_words_from_the_provider_still_count():
    daily = _ProviderSaid("Error code: 429 - Rate limit exceeded: free-models-per-day", 429)
    assert P._is_quota_exhausted(daily) and not P._is_transient(daily)
    # inside instructor's wrapper too: an attempt's EXCEPTION is the provider's statement, its completion is not
    try:
        from instructor.core.exceptions import FailedAttempt
    except ImportError:                                   # pragma: no cover
        from instructor.core.retry import FailedAttempt
    wrapped = InstructorRetryException(daily, n_attempts=1, total_usage=0,
                                       failed_attempts=[FailedAttempt(attempt_number=1, exception=daily,
                                                                      completion=None)])
    assert P._is_quota_exhausted(wrapped)
    assert P._retry_after_seconds(_ProviderSaid("throttled — retry in 7s", 429)) == 7.0


def test_a_structured_failure_whose_reply_came_back_names_no_provider_fault():
    from aughor.llm.reliability import SCHEMA_MISMATCH, UNAVAILABLE, Diagnosis, StructuredOutputError
    answered = StructuredOutputError(Diagnosis(SCHEMA_MISMATCH, MODEL_WROTE, MODEL_WROTE), _failed_validation())
    assert not P._is_quota_exhausted(answered) and not P._is_rate_limited(answered)
    assert P.classify_provider_error(answered) == "unknown"
    refused = StructuredOutputError(Diagnosis(UNAVAILABLE, "the request never reached the model (rate limited)", ""))
    assert P._is_rate_limited(refused)                   # UNAVAILABLE is about the request: its words still count


def test_a_spent_credit_balance_is_an_exhausted_allowance():
    for said, status in ((ANTHROPIC_SPENT, 400), ("Insufficient credits. Add more using https://openrouter.ai/credits", 402)):
        exc = _ProviderSaid(said, status)
        assert P._is_quota_exhausted(exc), said
        assert not P._is_transient(exc), said
        assert P.classify_provider_error(exc) == "quota_exhausted", said
    assert "topping up" in P.error_hint("quota_exhausted")


def _chain(monkeypatch, primary_fails_with: Exception, link_fails_first_with: Exception):
    """A primary and one fallback link, both stubbed at `_complete_on`; the link's first answer fails as given."""
    class _Out(BaseModel):
        text: str = "ok"

    monkeypatch.delenv("AUGHOR_FALLBACK_DISABLED", raising=False)
    monkeypatch.setenv("AUGHOR_FALLBACK_BACKENDS", "openrouter")
    monkeypatch.setattr(P, "_active_key", lambda b: "k")
    monkeypatch.setattr(P, "usable_key", lambda b: "k")
    seen: list[str] = []
    link_calls = {"n": 0}

    def fake_complete_on(client, backend, model, system, user, response_model, temperature, **kw):
        seen.append(backend)
        if backend == "anthropic":
            raise primary_fails_with
        link_calls["n"] += 1
        if link_calls["n"] == 1:
            raise link_fails_first_with
        return _Out(text=f"from {backend}")

    monkeypatch.setattr(P.LLMProvider, "_complete_on", staticmethod(fake_complete_on))
    prov = P.LLMProvider.__new__(P.LLMProvider)
    prov.backend, prov.role = "anthropic", "coder"
    prov._model, prov._client, prov._base_url = "claude-sonnet-5-5", object(), "a"
    monkeypatch.setattr(prov, "_warn_if_over_window", lambda *a, **k: None)
    link = P.LLMProvider.__new__(P.LLMProvider)
    link.backend, link.role = "openrouter", "coder"
    link._model, link._client, link._base_url = "deepseek/deepseek-v4.1-flash", object(), "o"
    monkeypatch.setattr(prov, "_fallback_provider", lambda b: link)
    return prov, _Out, seen


def test_a_link_whose_reply_failed_validation_stays_in_the_chain(monkeypatch):
    """The outage itself: the link answered, its answer failed validation, and the NEXT call must still reach it."""
    prov, out, seen = _chain(monkeypatch, _ProviderSaid(ANTHROPIC_SPENT, 400), _failed_validation())
    with pytest.raises(Exception):
        prov.complete("s", "u", out, 0.1)                # this call's answer was invalid: it fails, as it should
    assert not P._in_quota_cooldown("openrouter"), "the link that answered was put in a quota cooldown"
    assert prov._fallback_candidates() == ["openrouter"]
    assert prov.complete("s", "u", out, 0.1).text == "from openrouter"


def test_a_spent_primary_cools_down_and_is_not_probed_again(monkeypatch):
    prov, out, seen = _chain(monkeypatch, _ProviderSaid(ANTHROPIC_SPENT, 400), RuntimeError("one blip on the link"))
    with pytest.raises(Exception):
        prov.complete("s", "u", out, 0.1)
    assert P._in_quota_cooldown("anthropic")
    seen.clear()
    assert prov.complete("s", "u", out, 0.1).text == "from openrouter"
    assert seen == ["openrouter"], "a primary whose balance is spent was asked again"
