"""A statement reopened from Recent runs and run again is the statement as written, and translation is safe to repeat.

Measured first (2026-11-09, the user's statement on a Postgres connection): reopened from Recent runs it held the run's own
rewrites three times over — `NULLIF(NULLIF(NULLIF(x, 0), 0), 0)`, `CAST(CAST(… AS DECIMAL(18, 3)) AS DECIMAL(18, 3))`, and
the row cap twice. Recent runs reopened `sql_full`, what ran; each run translated and capped it again; and two of the
translation's steps were not safe to repeat — a divisor already `NULLIF(…, 0)` was wrapped again, and a ROUND whose
argument was already a numeric CAST was cast again.
"""
from __future__ import annotations

import sqlite3

import duckdb
import pytest
import sqlglot
from fastapi.testclient import TestClient

from aughor.db.connection import _pg_fix_round
from aughor.sql.engine_fit import from_duckdb

STATEMENT = ("SELECT platform, ROUND(100 * (SUM(CASE WHEN d >= '2026-09-01' THEN g END) "
             "/ SUM(CASE WHEN d >= '2026-08-01' THEN g END) - 1), 1) AS mom_pct FROM orders GROUP BY 1")


def _postgres(sql: str) -> str:
    """What the Postgres connector runs: the translation, then its ROUND fix (`_apply_dialect_fixes`)."""
    return _pg_fix_round(from_duckdb(sql, "postgres"))


def test_translating_translated_sql_again_changes_nothing_after_the_first_pass():
    once = _postgres(STATEMENT)
    twice = _postgres(once)
    assert _postgres(twice) == twice
    for out in (once, twice):
        assert out.count("NULLIF(") == 1
        assert "NULLIF(NULLIF(" not in out
    assert twice.count("AS DECIMAL(") + twice.count("::numeric") == 1


#: Every engine sqlglot writes for, from its own registry — a list typed here would miss the one it left out.
ENGINES = sorted({str(k) for k in sqlglot.Dialect.classes if k and str(k) != "duckdb"})


@pytest.mark.parametrize("dialect", ENGINES)
def test_a_divisor_already_guarded_is_not_guarded_again_on_any_engine(dialect):
    out = from_duckdb("SELECT a / NULLIF(b, 0) AS r, c / (NULLIF(d, 0)) AS s FROM t", dialect).upper().replace(" ", "")
    assert "NULLIF(NULLIF(" not in out and "NULLIF((NULLIF(" not in out
    assert from_duckdb(from_duckdb("SELECT a / b FROM t", dialect), dialect).upper().count("NULLIF(") <= 1


def test_an_unguarded_divisor_is_still_guarded():
    """Only `NULLIF(…, 0)` cannot be zero: a bare divisor, or one guarded against another value, is still wrapped."""
    out = from_duckdb("SELECT a / b AS r, c / NULLIF(d, 1) AS s FROM t", "postgres")
    assert "/ NULLIF(b, 0)" in out
    assert "NULLIF(NULLIF(d, 1), 0)" in out


def test_round_casts_an_argument_unless_it_already_is_a_numeric_cast():
    assert _pg_fix_round("SELECT ROUND(CAST(x AS DECIMAL(18, 3)), 1) FROM t") == "SELECT ROUND(CAST(x AS DECIMAL(18, 3)), 1) FROM t"
    assert _pg_fix_round("SELECT ROUND((x)::numeric(10, 2), 1) FROM t") == "SELECT ROUND((x)::numeric(10, 2), 1) FROM t"
    # a product of a numeric and a double is a double: cast
    mixed = "CAST(a AS DOUBLE PRECISION) * CAST(b AS DECIMAL(18, 3))"
    assert _pg_fix_round(f"SELECT ROUND({mixed}, 1) FROM t") == f"SELECT ROUND(({mixed})::numeric, 1) FROM t"
    assert _pg_fix_round("SELECT ROUND(x::float, 2) FROM t") == "SELECT ROUND((x::float)::numeric, 2) FROM t"


# ── the audit row keeps the statement as written ─────────────────────────────────────────────────────────────

def test_an_audit_store_from_before_gains_the_column_and_a_row_outside_a_run_writes_none(tmp_path, monkeypatch):
    from aughor.security import audit
    path = tmp_path / "audit.db"
    monkeypatch.setattr(audit, "_DB_PATH", path)
    audit.AuditLogger.recent()                                    # the store as it is now, then put back to version 4
    c = sqlite3.connect(path)
    c.execute("ALTER TABLE audit_log DROP COLUMN sql_written")
    c.execute("INSERT INTO audit_log (id, ts, connection_id, sql_digest, sql_full) VALUES ('old', 't', 'c', 's', 's')")
    c.execute("PRAGMA user_version = 4")
    c.commit()
    c.close()
    audit.AuditLogger.log(connection_id="c", sql="SELECT 1")
    with audit.as_written("select 2"):
        audit.AuditLogger.log(connection_id="c", sql="SELECT * FROM (select 2) __q LIMIT 501")
    rows = {r["sql_full"]: r["sql_written"] for r in audit.AuditLogger.recent(connection_id="c")}
    assert rows == {"s": "", "SELECT 1": "", "SELECT * FROM (select 2) __q LIMIT 501": "select 2"}
    c = sqlite3.connect(path)
    assert c.execute("PRAGMA user_version").fetchone()[0] == 5
    c.close()


@pytest.fixture()
def duck(tmp_path):
    from aughor.db import registry
    db = tmp_path / "written.duckdb"
    c = duckdb.connect(str(db))
    c.execute("CREATE TABLE t AS SELECT * FROM range(3) r(n)")
    c.close()
    cid = registry.add_connection("written", "duckdb", str(db))
    yield cid
    registry.delete_connection(cid)


def test_the_workbench_run_records_what_was_written_beside_what_ran(duck):
    from aughor.api import app
    from aughor.security.audit import AuditLogger
    sql = "select n from t where n > 0"
    r = TestClient(app).post("/query/run", json={"conn_id": duck, "sql": sql, "format": "typed", "limit": 500,
                                                 "source": "query_workbench", "use_cache": False})
    assert r.status_code == 200, r.text
    rows = AuditLogger.recent(connection_id=duck, label="query_workbench")
    assert rows, "the run left no audit row"
    assert rows[0]["sql_written"] == sql
    assert "__q LIMIT 501" in rows[0]["sql_full"]
