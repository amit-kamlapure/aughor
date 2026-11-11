"""Tests for the P0 delta ratchet (evals/ratchet.py).

The pure logic (summarize / persist / compare) is exercised without an LLM or a
warehouse connection, so it runs in the default fast suite. The live end-to-end
smoke that actually generates SQL is marked ``eval`` and opt-in.
"""
from __future__ import annotations

import pytest

from evals.ratchet import (
    RatchetItem,
    compare_to_baseline,
    get_baseline,
    load_run,
    persist_run,
    set_baseline,
    summarize,
)


def _items(overall: float, exec_success: float = 1.0, tokens: int = 1000, n: int = 4) -> list[RatchetItem]:
    return [
        RatchetItem(qid=f"q{i}", difficulty="easy" if i % 2 else "medium", category="c",
                    overall=overall, exec_success=exec_success, tokens=tokens, llm_calls=1, latency_ms=100.0)
        for i in range(n)
    ]


def test_summarize_aggregates_accuracy_and_compute():
    s = summarize(_items(0.8, tokens=1000), mode="full", connection="samples",
                  dataset="golden.jsonl", git_sha="abc")
    assert s.n == 4
    assert s.mean_overall == pytest.approx(0.8)
    assert s.exec_rate == pytest.approx(1.0)
    assert s.total_tokens == 4000
    assert set(s.by_difficulty) == {"easy", "medium"}


def test_compare_passes_when_stable():
    base = summarize(_items(0.80, tokens=1000), mode="full", connection="s", dataset="g", git_sha="a")
    cur = summarize(_items(0.81, tokens=1000), mode="full", connection="s", dataset="g", git_sha="b")
    ok, reasons = compare_to_baseline(cur, base)
    assert ok, reasons


def test_compare_fails_on_accuracy_drop():
    base = summarize(_items(0.80, tokens=1000), mode="full", connection="s", dataset="g", git_sha="a")
    cur = summarize(_items(0.70, tokens=1000), mode="full", connection="s", dataset="g", git_sha="b")
    ok, reasons = compare_to_baseline(cur, base)
    assert not ok
    assert any("accuracy regressed" in r for r in reasons)


def test_compare_fails_on_compute_rise():
    base = summarize(_items(0.80, tokens=1000), mode="full", connection="s", dataset="g", git_sha="a")
    cur = summarize(_items(0.80, tokens=1300), mode="full", connection="s", dataset="g", git_sha="b")  # +30%
    ok, reasons = compare_to_baseline(cur, base)
    assert not ok
    assert any("compute rose" in r for r in reasons)


def test_compare_flags_dataset_and_mode_mismatch():
    base = summarize(_items(0.80), mode="full", connection="s", dataset="g1", git_sha="a")
    cur = summarize(_items(0.80), mode="reference", connection="s", dataset="g2", git_sha="b")
    ok, reasons = compare_to_baseline(cur, base)
    assert not ok
    assert any("dataset mismatch" in r for r in reasons)
    assert any("mode mismatch" in r for r in reasons)


def test_reference_mode_zero_tokens_skips_compute_check():
    # reference replays cost no tokens; a token rise from 0 must not be flagged.
    base = summarize(_items(0.80, tokens=0), mode="reference", connection="s", dataset="g", git_sha="a")
    cur = summarize(_items(0.80, tokens=0), mode="reference", connection="s", dataset="g", git_sha="b")
    ok, reasons = compare_to_baseline(cur, base)
    assert ok, reasons


def test_persist_and_baseline_roundtrip(tmp_path):
    db = tmp_path / "eval_baseline.db"
    items = _items(0.75, tokens=1200)
    summary = summarize(items, mode="full", connection="samples", dataset="golden.jsonl", git_sha="deadbeef")
    run_id = persist_run(summary, items, db_path=db)

    loaded = load_run(run_id, db_path=db)
    assert loaded is not None
    assert loaded.mean_overall == pytest.approx(0.75)
    assert loaded.total_tokens == summary.total_tokens

    set_baseline("main", run_id, db_path=db)
    base = get_baseline("main", db_path=db)
    assert base is not None and base.run_id == run_id


def test_compare_refuses_a_baseline_of_another_model():
    """F1 — one model's accuracy read against another's baseline measures the swap, not the change."""
    base = summarize(_items(0.80), mode="nightly", connection="s", dataset="g", git_sha="a", model="anthropic:a")
    cur = summarize(_items(0.80), mode="nightly", connection="s", dataset="g", git_sha="b", model="gemini:b")
    ok, reasons = compare_to_baseline(cur, base)
    assert not ok and any("model mismatch" in r for r in reasons)
    # history from before the column carries no model: not a mismatch
    legacy = summarize(_items(0.80), mode="nightly", connection="s", dataset="g", git_sha="a")
    assert compare_to_baseline(cur, legacy)[0]


def test_the_model_rides_the_store_and_items_read_back(tmp_path):
    from evals.ratchet import load_items
    db = tmp_path / "eval_baseline.db"
    items = _items(0.5, n=3)
    s = summarize(items, mode="nightly", connection="c", dataset="g", git_sha="x", model="anthropic:claude-sonnet-5-5")
    persist_run(s, items, db_path=db)
    assert load_run(s.run_id, db_path=db).model == "anthropic:claude-sonnet-5-5"
    assert sorted(i.qid for i in load_items(s.run_id, db_path=db)) == ["q0", "q1", "q2"]


def test_a_store_from_before_the_model_column_keeps_its_runs(tmp_path):
    import sqlite3
    db = tmp_path / "old.db"
    con = sqlite3.connect(db)
    con.execute("""CREATE TABLE runs (run_id TEXT PRIMARY KEY, git_sha TEXT, created_at TEXT, mode TEXT,
        connection TEXT, dataset TEXT, label TEXT, n INTEGER, mean_overall REAL, exec_rate REAL,
        total_tokens INTEGER, total_llm_calls INTEGER, mean_latency_ms REAL, by_difficulty TEXT)""")
    con.execute("INSERT INTO runs VALUES ('old1','a','2026-07-06','full','samples','g','',53,0.8,0.9,100,53,1.0,'{}')")
    con.commit()
    con.close()
    old = load_run("old1", db_path=db)
    assert old is not None and old.model == "" and old.mean_overall == pytest.approx(0.8)


@pytest.mark.eval
def test_ratchet_live_smoke():
    """End-to-end: generate SQL for 2 questions and confirm accuracy + compute are
    captured. Requires a live LLM backend + the `samples` connection."""
    import tempfile
    from pathlib import Path

    from evals.ratchet import run_ratchet

    with tempfile.TemporaryDirectory() as d:
        summary, items = run_ratchet(mode="full", limit=2, db_path=Path(d) / "b.db", progress=False)
    assert summary.n == 2
    assert summary.total_tokens > 0, "live full-pipeline run should meter tokens"
    assert all(i.llm_calls >= 1 for i in items)
