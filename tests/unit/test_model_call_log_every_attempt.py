"""Every attempt a provider received — or refused — is one row in the model-call log (2026-11-09).

Two paid runs on a restored copy on 2026-11-08 (the Anthropic balance spent, every call falling back to OpenRouter)
found the log blind where it mattered: a refused TOOL turn raised before the only record was written; the re-send
without reasoning extras, a failed bounded repair, a failed low-reasoning retry and a failed JSON re-ask left no row;
a failed row carried only the exception's type name, never what the provider said; a fallback hop reached only the
SSE stream; and an event with no trace was dropped — so the eval judge's calls, and every model call made outside a
run, never reached the usage page.

What these tests hold: each attempt is one row — ok or not, backend, model, whether it was a fallback link and of
which primary, the failure's class and the provider's own words; a refused attempt costs $0 and is counted apart by
every reader of spend, never as a billed call; a successful call with no sub-attempts is still exactly one row.

No model is called: every client here is a stand-in that answers or raises as the test says.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from instructor.core.exceptions import InstructorRetryException
from pydantic import BaseModel, ValidationError

from pramanyx import telemetry
from pramanyx.kernel.ledger import Ledger
from pramanyx.llm import coordination as C
from pramanyx.llm import provider as P
from pramanyx.obs import session_log
from pramanyx.obs import usage as U

try:
    from instructor.core.exceptions import FailedAttempt
except ImportError:                                       # pragma: no cover - older instructor
    from instructor.core.retry import FailedAttempt

ANTHROPIC_SPENT = "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing."


class _Spec(BaseModel):
    days: int


class _ProviderSaid(Exception):
    """A provider's HTTP error, shaped like the SDKs': a status code, a body, a message."""

    def __init__(self, message: str, status_code: int, body: dict | None = None):
        super().__init__(message)
        self.message, self.status_code, self.body = message, status_code, body


def _spent_anthropic() -> _ProviderSaid:
    """Anthropic's SDK error, as it reads: the status, and the body rendered into the message."""
    body = {"type": "error", "error": {"type": "invalid_request_error", "message": ANTHROPIC_SPENT}}
    return _ProviderSaid(f"Error code: 400 - {body!r}", 400, body)


def _completion(text: str, pt: int, ct: int, finish: str = "stop"):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=text, tool_calls=None, reasoning=None,
                                                         reasoning_content=None), finish_reason=finish)],
        usage=SimpleNamespace(prompt_tokens=pt, completion_tokens=ct))


def _answered_unusably(text: str, pt: int, ct: int, finish: str = "stop") -> InstructorRetryException:
    """What instructor raises when the model ANSWERED and the answer did not validate."""
    try:
        _Spec.model_validate({"days": "many"})
    except ValidationError as refused:
        invalid = refused
    done = _completion(text, pt, ct, finish)
    return InstructorRetryException(invalid, last_completion=done, n_attempts=1, total_usage=0,
                                    failed_attempts=[FailedAttempt(attempt_number=1, exception=invalid,
                                                                   completion=done)])


def _client(*answers, anthropic: bool = False):
    """A stand-in client whose structured endpoint gives ``answers`` in order: an exception is raised, a tuple is
    returned as ``(out, raw)``."""
    sent: list[dict] = []

    def cwc(**kw):
        sent.append(kw)
        answer = answers[min(len(sent), len(answers)) - 1]
        if isinstance(answer, BaseException):
            raise answer
        return answer

    endpoint = SimpleNamespace(create_with_completion=cwc)
    if anthropic:
        return SimpleNamespace(messages=endpoint), sent
    return SimpleNamespace(chat=SimpleNamespace(completions=endpoint)), sent


def _provider(backend: str, model: str, client) -> P.LLMProvider:
    prov = P.LLMProvider.__new__(P.LLMProvider)
    prov.backend, prov.role, prov._model, prov._client, prov._base_url = backend, "coder", model, client, backend
    return prov


def _rows(trace: str) -> list[dict]:
    return [e for e in Ledger.default().session_events(trace_id=trace, ascending=True, limit=100)
            if e["kind"] == session_log.LLM_CALL]


@pytest.fixture(autouse=True)
def _own_the_log(monkeypatch):
    monkeypatch.setenv("PRAMANYX_LLM_MAX_RETRIES", "0")
    monkeypatch.delenv("PRAMANYX_FALLBACK_DISABLED", raising=False)
    monkeypatch.setattr(P.time, "sleep", lambda _s: None)
    monkeypatch.setattr(U, "ensure_catalogue_prices", lambda **_k: 0)
    C.set_default(None)
    Ledger.default().session_events_clear()
    yield
    Ledger.default().session_events_clear()
    C.set_default(None)


def _chain(monkeypatch, primary: P.LLMProvider, link: P.LLMProvider) -> None:
    monkeypatch.setenv("PRAMANYX_FALLBACK_BACKENDS", link.backend)
    monkeypatch.setattr(P, "_active_key", lambda b: "k")
    monkeypatch.setattr(P, "usable_key", lambda b: "k")
    monkeypatch.setattr(primary, "_warn_if_over_window", lambda *a, **k: None)
    monkeypatch.setattr(primary, "_fallback_provider", lambda b: link if b == link.backend else None)


# ── the contract: a refused primary and the link that answered ───────────────────────────────────────────────────

def test_a_refused_then_fallback_call_is_one_billed_row_and_one_refused_row(monkeypatch):
    primary_client, _ = _client(_spent_anthropic(), anthropic=True)
    link_client, _ = _client((_Spec(days=3), _completion('{"days": 3}', 30, 10)))
    primary = _provider("anthropic", "claude-sonnet-5-5", primary_client)
    link = _provider("openrouter", "deepseek/deepseek-v4.1-flash", link_client)
    _chain(monkeypatch, primary, link)

    with telemetry.bind_trace("t-hop"):
        assert primary.complete("s", "u", _Spec, 0.1).days == 3

    rows = _rows("t-hop")
    assert [(r["provider"], r["ok"]) for r in rows] == [("anthropic", False), ("openrouter", True)]
    refused_row, billed = rows
    # the refusal: its class, its provider's own words, no tokens, and billed nothing
    assert refused_row["error_class"] == "quota_exhausted"
    assert refused_row["payload"].get("refused") is True
    assert refused_row["payload"].get("provider_said") == ANTHROPIC_SPENT
    assert refused_row["payload"].get("exception") == "_ProviderSaid"
    assert refused_row["total_tokens"] is None and refused_row["fallback"] is False
    # the link that answered: which primary it stood in for, why, and its place in the chain
    assert billed["fallback"] is True
    assert billed["payload"].get("fallback_of") == {"backend": "anthropic", "model": "claude-sonnet-5-5",
                                                    "why": "quota_exhausted"}
    assert billed["payload"].get("link") == 1
    assert (billed["prompt_tokens"], billed["completion_tokens"]) == (30, 10)
    assert "refused" not in billed["payload"]
    assert [session_log.refused(r) for r in rows] == [True, False]


def test_every_reader_of_spend_counts_the_refusal_apart(monkeypatch):
    """The usage page, the rollup the caps and agent spend read, the per-model fold, the trace index, the nightly's
    ceiling and the cost of one call: one billed call, one refusal at $0, never two calls or one failure."""
    monkeypatch.setitem(U.PRICES, ("openrouter", "deepseek/deepseek-v4.1-flash"), U.Price(1.0, 2.0, "2026-11-09"))
    U.price_for.cache_clear()
    test_a_refused_then_fallback_call_is_one_billed_row_and_one_refused_row(monkeypatch)
    rows = _rows("t-hop")
    billed_usd = 30 / 1e6 * 1.0 + 10 / 1e6 * 2.0

    # one call's cost: the refusal is a KNOWN zero though Claude has no price here
    assert U.cost_of_call(rows[0]) == (0.0, True)

    report = U.rollup(rows, axes=("provider", "model"))
    assert (report.total_calls, report.refused_calls) == (1, 1)
    by = {r.key["provider"]: r for r in report.rows}
    assert (by["anthropic"].calls, by["anthropic"].refused, by["anthropic"].failures) == (0, 1, 0)
    assert (by["anthropic"].calls_without_usage, by["anthropic"].unpriced_calls) == (0, 0)
    assert by["openrouter"].calls == 1 and by["openrouter"].cost_usd == pytest.approx(billed_usd)
    assert report.to_dict()["refused_calls"] == 1 and by["anthropic"].to_dict()["refused"] == 1

    from pramanyx.routers.obs import usage_summary
    page = usage_summary(range="24h")
    assert (page["calls"], page["refused_calls"], page["untraced_calls"]) == (1, 1, 0)
    assert page["cost_usd"] == pytest.approx(round(billed_usd, 4)) and page["cost_is_complete"] is True
    assert page["calls_without_usage"] == 0
    assert page["fallback"] == {"fell_back": 1, "of_attributed": 1, "rate": 1.0}

    models = {m["provider"]: m for m in session_log.model_usage()}
    assert (models["anthropic"]["calls"], models["anthropic"]["refused"]) == (0, 1)
    assert models["anthropic"]["failures"] == 0 and models["openrouter"]["calls"] == 1

    run = [r for r in session_log.recent_sessions() if r["trace_id"] == "t-hop"][0]
    assert (run["llm_calls"], run["refused_calls"], run["calls_without_usage"]) == (1, 1, 0)
    assert run["cost_usd"] == pytest.approx(billed_usd)

    weight = session_log.prompt_weight()
    assert (weight["scanned_calls"], weight["refused_calls"]) == (1, 1)

    from evals import nightly as N
    spent = N.spend_of(rows, U.cost_of_call)
    assert (spent.calls, spent.failed_without_usage, spent.calls_without_usage) == (2, 1, 0)
    assert spent.usd == pytest.approx(billed_usd)
    assert N.model_key(spent.models) == "openrouter:deepseek/deepseek-v4.1-flash"
    assert N.CostCeiling(limit_usd=1.0).reason_to_stop(spent, 0.0, calls_made=2) == ""


def test_a_primary_in_cooldown_is_not_a_row_and_the_link_says_why(monkeypatch):
    link_client, _ = _client((_Spec(days=1), _completion('{"days": 1}', 5, 1)))
    primary = _provider("anthropic", "claude-sonnet-5-5", _client(RuntimeError("never asked"), anthropic=True)[0])
    link = _provider("openrouter", "deepseek/deepseek-v4.1-flash", link_client)
    _chain(monkeypatch, primary, link)
    P._mark_quota_exhausted("anthropic")

    with telemetry.bind_trace("t-cool"):
        primary.complete("s", "u", _Spec, 0.1)

    rows = _rows("t-cool")
    assert [r["provider"] for r in rows] == ["openrouter"]          # no request went to the primary: no row
    assert rows[0]["payload"]["fallback_of"]["why"] == "quota_cooldown"


def test_a_link_that_failed_before_the_one_that_answered_is_in_the_log_in_order(monkeypatch):
    primary_client, _ = _client(_spent_anthropic(), anthropic=True)
    first_link, _ = _client(_ProviderSaid("Error code: 429 - Rate limit exceeded: free-models-per-min", 429))
    second_link, _ = _client((_Spec(days=2), _completion('{"days": 2}', 9, 2)))
    primary = _provider("anthropic", "claude-sonnet-5-5", primary_client)
    links = {"groq": _provider("groq", "llama-x", first_link),
             "openrouter": _provider("openrouter", "deepseek/deepseek-v4.1-flash", second_link)}
    _chain(monkeypatch, primary, links["openrouter"])
    monkeypatch.setenv("PRAMANYX_FALLBACK_BACKENDS", "groq,openrouter")
    monkeypatch.setattr(primary, "_fallback_provider", lambda b: links.get(b))

    with telemetry.bind_trace("t-links"):
        primary.complete("s", "u", _Spec, 0.1)

    rows = _rows("t-links")
    assert [(r["provider"], r["ok"], (r["payload"] or {}).get("link")) for r in rows] == [
        ("anthropic", False, None), ("groq", False, 1), ("openrouter", True, 2)]
    assert rows[1]["error_class"] == "rate_limited" and rows[1]["payload"]["refused"] is True
    assert rows[1]["payload"]["provider_said"] == "Error code: 429 - Rate limit exceeded: free-models-per-min"
    assert rows[1]["payload"]["fallback_of"]["why"] == "quota_exhausted"


# ── a refused tool turn ────────────────────────────────────────────────────────────────────────────────────────────

def test_a_refused_tool_turn_is_a_row_and_the_link_that_answered_says_whose(monkeypatch):
    """The analyst's question-intake on 2026-11-08: a tool turn refused before the only record was written."""
    said = "Provider returned error"
    body = {"message": said, "code": 400, "metadata": {"raw": "tools are not supported with json_object"}}
    primary_client, _ = _client(_ProviderSaid("Error code: 400", 400, body))
    reply = _completion("the answer", 50, 5)
    link_client, _ = _client((reply, None))              # instructor's pass-through: the completion comes FIRST
    primary = _provider("openrouter", "deepseek/deepseek-v4.1-flash", primary_client)
    link = _provider("groq", "llama-x", link_client)
    _chain(monkeypatch, primary, link)

    with telemetry.bind_trace("t-tools"):
        turn = primary.complete_with_tools("s", "u", [{"type": "function", "function": {"name": "f"}}])
    assert turn.text == "the answer"

    rows = _rows("t-tools")
    assert [(r["provider"], r["ok"]) for r in rows] == [("openrouter", False), ("groq", True)]
    assert rows[0]["error_class"] == "bad_request" and rows[0]["payload"]["refused"] is True
    assert rows[0]["payload"]["provider_said"] == f"{said}: tools are not supported with json_object"
    assert rows[1]["payload"]["fallback_of"] == {"backend": "openrouter", "model": "deepseek/deepseek-v4.1-flash",
                                                 "why": "bad_request"}
    assert (rows[1]["prompt_tokens"], rows[1]["completion_tokens"]) == (50, 5)


def test_a_refused_tool_turn_on_claude_is_a_row(monkeypatch):
    """Claude's tool turns speak `messages` (PENDING item 17) — the same record on that branch."""
    monkeypatch.setenv("PRAMANYX_FALLBACK_BACKENDS", "none")

    def create(**_kw):
        raise _spent_anthropic()

    primary = _provider("anthropic", "claude-sonnet-5-5", SimpleNamespace(messages=SimpleNamespace(create=create)))
    with telemetry.bind_trace("t-claude-tools"), pytest.raises(_ProviderSaid):
        primary.complete_with_tools("s", "u", [{"type": "function", "function": {"name": "f", "parameters": {}}}])
    rows = _rows("t-claude-tools")
    assert [(r["provider"], r["error_class"], r["payload"]["refused"]) for r in rows] == [
        ("anthropic", "quota_exhausted", True)]
    assert rows[0]["payload"]["provider_said"] == ANTHROPIC_SPENT


# ── sub-attempts: each its own row ───────────────────────────────────────────────────────────────────────────────

def test_a_repaired_answer_is_two_rows_each_with_its_own_tokens(monkeypatch):
    """Before: the repair wrote a row AND the caller wrote another with the repair's tokens — two rows for one
    request — while the first answer, which was billed, wrote none."""
    client, sent = _client(_answered_unusably('{"days": "many"}', 100, 20),
                           (_Spec(days=3), _completion('{"days": 3}', 40, 5)))
    with telemetry.bind_trace("t-repair"):
        out = P.LLMProvider._complete_on(client, "groq", "llama-x", "s", "u", _Spec, 0.1, role="coder")
    assert out.days == 3 and len(sent) == 2

    rows = _rows("t-repair")
    assert [(r["ok"], r["prompt_tokens"], r["completion_tokens"]) for r in rows] == [(False, 100, 20),
                                                                                     (True, 40, 5)]
    assert rows[0]["error_class"] == "schema_mismatch" and rows[0]["payload"]["refused"] is False
    assert "provider_said" not in rows[0]["payload"]                 # the model's words are never kept as the provider's
    assert rows[1]["payload"]["attempt"] == "repair" and rows[1]["payload"]["repair_of"] == "schema_mismatch"
    assert sum(r["total_tokens"] for r in rows) == 165


def test_a_failed_repair_is_a_row(monkeypatch):
    client, sent = _client(_answered_unusably('{"days": "many"}', 100, 20),
                           _ProviderSaid("Error code: 503 - upstream overloaded", 503))
    with telemetry.bind_trace("t-repair-failed"), pytest.raises(Exception):
        P.LLMProvider._complete_on(client, "groq", "llama-x", "s", "u", _Spec, 0.1, role="coder")
    assert len(sent) == 2

    rows = _rows("t-repair-failed")
    assert [(r["ok"], (r["payload"] or {}).get("attempt")) for r in rows] == [(False, None), (False, "repair")]
    assert rows[1]["payload"]["refused"] is True and rows[1]["payload"]["repair_of"] == "schema_mismatch"
    assert rows[1]["payload"]["provider_said"] == "Error code: 503 - upstream overloaded"


def test_the_request_refused_for_its_reasoning_extras_is_a_row_before_the_resend(monkeypatch):
    monkeypatch.setenv("PRAMANYX_REASONING_EFFORT", "medium")
    client, sent = _client(_ProviderSaid("Error code: 400 - unrecognized field: reasoning", 400),
                           (_Spec(days=4), _completion('{"days": 4}', 12, 3)))
    with telemetry.bind_trace("t-extras"):
        P.LLMProvider._complete_on(client, "openrouter", "deepseek/x", "s", "u", _Spec, 0.1, role="coder")
    assert ["extra_body" in kw for kw in sent] == [True, False]

    rows = _rows("t-extras")
    assert [r["ok"] for r in rows] == [False, True]
    assert rows[0]["payload"]["attempt"] == "with_reasoning_extras" and rows[0]["payload"]["refused"] is True
    assert rows[0]["error_class"] == "bad_request"
    assert rows[1]["payload"]["without_reasoning_extras"] is True and rows[1]["prompt_tokens"] == 12


def test_a_failed_low_reasoning_retry_is_a_row_with_what_it_was_billed(monkeypatch):
    monkeypatch.setenv("PRAMANYX_REASONING_EFFORT", "medium")
    truncated = _answered_unusably('{"days": 1', 50, 8192, finish="length")
    client, sent = _client(truncated, truncated)
    with telemetry.bind_trace("t-low"), pytest.raises(Exception):
        P.LLMProvider._complete_on(client, "openrouter", "deepseek/x", "s", "u", _Spec, 0.1, role="coder")
    assert [kw.get("extra_body", {}).get("reasoning", {}).get("effort") for kw in sent] == ["medium", "low"]

    rows = _rows("t-low")
    assert [(r["error_class"], (r["payload"] or {}).get("attempt")) for r in rows] == [
        ("truncated", None), ("truncated", "low_reasoning_retry")]
    assert all(r["payload"]["refused"] is False and r["completion_tokens"] == 8192 for r in rows)


def test_a_low_reasoning_retry_that_answers_is_the_answering_row(monkeypatch):
    monkeypatch.setenv("PRAMANYX_REASONING_EFFORT", "medium")
    client, _ = _client(_answered_unusably('{"days": 1', 50, 8192, finish="length"),
                        (_Spec(days=1), _completion('{"days": 1}', 50, 900)))
    with telemetry.bind_trace("t-low-ok"):
        P.LLMProvider._complete_on(client, "openrouter", "deepseek/x", "s", "u", _Spec, 0.1, role="coder")
    rows = _rows("t-low-ok")
    assert [(r["ok"], (r["payload"] or {}).get("attempt")) for r in rows] == [(False, None),
                                                                              (True, "low_reasoning_retry")]


def test_a_failed_json_reask_is_a_row(monkeypatch):
    from tests.unit.test_anthropic_json_reask import Out, _claude

    logged: list[dict] = []
    monkeypatch.setattr(P, "_record_llm_call", lambda **kw: logged.append(kw))
    client, sent = _claude([], text_answer=None)                              # nothing, then prose again
    with pytest.raises(Exception):
        P.LLMProvider._complete_on(client, "anthropic", "claude-sonnet-5-5", "s", "u", Out, 0.1, role="coder")
    assert len(sent) == 2
    assert [(kw.get("ok"), (kw.get("extra") or {}).get("attempt")) for kw in logged] == [
        (False, None), (False, "json_reask")]


def test_a_streaming_rung_refused_for_its_extras_is_a_row(monkeypatch):
    monkeypatch.setenv("PRAMANYX_REASONING_EFFORT", "medium")
    sent: list[dict] = []

    def create(**kw):
        sent.append(kw)
        if "stream_options" in kw:
            raise _ProviderSaid("Error code: 400 - stream_options is not supported", 400)
        return iter([SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content='{"days": 5}'))],
                                     usage=None),
                     SimpleNamespace(choices=[], usage=SimpleNamespace(prompt_tokens=7, completion_tokens=2))])

    client = SimpleNamespace(client=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))))
    with telemetry.bind_trace("t-stream"):
        out = P.LLMProvider._stream_on(client, "groq", "llama-x", "s", "u", _Spec, 0.0, "days", lambda _t: None,
                                       role="narrator")
    assert out.days == 5 and len(sent) == 2

    rows = _rows("t-stream")
    assert [(r["ok"], (r["payload"] or {}).get("attempt")) for r in rows] == [(False, "with_streaming_extras"),
                                                                              (True, None)]
    assert rows[0]["payload"]["refused"] is True and rows[0]["payload"]["streamed"] is True


# ── the one-row contract for a clean call, and a call made outside every run ────────────────────────────────────────

def test_a_clean_call_is_still_exactly_one_row():
    client, _ = _client((_Spec(days=6), _completion('{"days": 6}', 3, 1)))
    with telemetry.bind_trace("t-clean"):
        P.LLMProvider._complete_on(client, "groq", "llama-x", "s", "u", _Spec, 0.1, role="coder")
    rows = _rows("t-clean")
    assert len(rows) == 1 and rows[0]["ok"] is True
    assert not {"attempt", "refused", "fallback_of", "link"} & set(rows[0]["payload"])


def test_a_model_call_made_outside_every_run_is_kept_under_what_made_it():
    """An eval script's judge, an HTTP route outside the doors, the hourly ontology refresh: no trace was bound, and
    the row was dropped. Now it is written under `untraced:<origin>:<day>`, and the usage page says how many."""
    assert telemetry.current_trace_id() == ""
    client, _ = _client((_Spec(days=7), _completion('{"days": 7}', 4, 2)))
    P.LLMProvider._complete_on(client, "groq", "llama-x", "s", "u", _Spec, 0.1, role="coder")

    day = datetime.now(timezone.utc).date().isoformat()
    rows = _rows(f"untraced:script:{day}")
    assert len(rows) == 1 and (rows[0]["prompt_tokens"], rows[0]["completion_tokens"]) == (4, 2)

    from pramanyx.routers.obs import usage_summary
    assert usage_summary(range="24h")["untraced_calls"] == 1
    run = [r for r in session_log.recent_sessions() if r["trace_id"] == f"untraced:script:{day}"][0]
    assert run["untraced"] is True and run["llm_calls"] == 1


# ── what a refusal says ─────────────────────────────────────────────────────────────────────────────────────────

def test_the_providers_words_are_found_inside_instructors_retry_error():
    """instructor raises its retry error inside tenacity's RetryError handler: the provider's own error is in its
    arguments and failed attempts, never on `__cause__`. Walking `__cause__` alone said "(bad request)" with no words."""
    refusal = _ProviderSaid("Error code: 400", 400, {"message": "Provider returned error",
                                                     "metadata": {"raw": "response_format is not supported"}})
    try:
        try:
            raise RuntimeError("RetryError[<Future at 0x10 state=finished raised _ProviderSaid>]")
        except RuntimeError:
            raise InstructorRetryException(refusal, n_attempts=1, total_usage=0,
                                           failed_attempts=[FailedAttempt(attempt_number=1, exception=refusal,
                                                                          completion=None)])
    except InstructorRetryException as wrapped:
        exc = wrapped
    assert exc.__cause__ is None and isinstance(exc.__context__, RuntimeError)
    assert P.provider_words(exc) == "Provider returned error: response_format is not supported"
    failure = P.attempt_failure(exc)
    assert failure["error_class"] == "bad_request" and failure["refused"] is True
    assert failure["provider_said"] == "Provider returned error: response_format is not supported"


def test_a_key_in_the_providers_words_is_masked():
    exc = _ProviderSaid("Incorrect API key provided: sk-proj-abcdefghijklmnopqrstuvwxyz0123", 401)
    failure = P.attempt_failure(exc)
    assert failure["error_class"] == "bad_key" and failure["refused"] is True
    assert "abcdefghijklmnop" not in failure["provider_said"] and "REDACTED" in failure["provider_said"]


def test_a_timeout_is_not_called_refused():
    """A model may have run — and billed — before the deadline. Its cost stays unknown, and says so."""
    failure = P.attempt_failure(TimeoutError("request timed out"))
    assert failure["error_class"] == "timeout" and failure["refused"] is False
    assert P.attempt_failure(_ProviderSaid("Error code: 500 - internal", 500))["refused"] is True
