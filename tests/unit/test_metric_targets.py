"""A metric's health target (2026-11-10, the user: "add certain targets to the Metrics for Luxexperience so that Health
tab delivers something", then "Yes, add direction"): a target faces a side — beating it is on target, falling short by
the warning distance warns, by the critical one is off target — it is set through its own door without re-sending the
definition, and the scorecard scores only the metrics of the connection it is asked about."""
import pytest

from aughor.semantic.metrics import MetricDefinition, target_status

CONN = "c_lux"


def _m(**target) -> MetricDefinition:
    return MetricDefinition(name="m", label="M", sql="SELECT 1", **target)


@pytest.mark.parametrize("direction, current, status", [
    ("higher", 400, "green"), ("higher", 450, "green"),          # at or beyond an aim above
    ("higher", 388, "yellow"), ("higher", 355, "red"),
    ("lower", 0.28, "green"), ("lower", 0.10, "green"),          # a return rate well below its aim is on target
    ("lower", 0.31, "yellow"), ("lower", 0.34, "red"),
])
def test_a_directed_target_is_never_missed_by_beating_it(direction, current, status):
    aim = {"higher": dict(target_value=400, warning_threshold=10, critical_threshold=40),
           "lower": dict(target_value=0.28, warning_threshold=0.02, critical_threshold=0.05)}[direction]
    assert target_status(current, _m(target_direction=direction, **aim)) == status


def test_a_band_is_short_on_either_side_and_no_value_is_unknown():
    band = _m(target_value=12, warning_threshold=2, critical_threshold=4)
    assert [target_status(v, band) for v in (12, 10.5, 14.5, 7.9, 16.2)] == ["green", "green", "yellow", "red", "red"]
    assert target_status(None, band) == "unknown" and target_status(5, _m()) == "unknown"


@pytest.fixture
def client(monkeypatch, tmp_path):
    from aughor.semantic import metrics as M
    monkeypatch.setenv("AUGHOR_METRICS_PATH", str(tmp_path / "metrics.instance.json"))
    monkeypatch.setenv("AUGHOR_ACTION_APPROVAL", "0")
    M.save_metric(M.MetricDefinition(
        name="aov", connection=CONN, schema_name="lux", label="AOV", unit="EUR, typically 300-2000",
        sql="SELECT AVG(total) AS aov FROM orders", tables=["orders"], time_column="orders.order_date",
        status="approved", version=4, approved_by="finance"))
    M.save_metric(M.MetricDefinition(name="other_aov", connection="c_other", label="Other AOV", sql="SELECT 1",
                                     target_value=1.0, status="approved"))
    restated: list[str] = []
    monkeypatch.setattr("aughor.routers.metrics._restate_briefings", restated.append)
    from fastapi.testclient import TestClient

    from aughor.api import app
    c = TestClient(app)
    c.restated = restated
    return c


def test_a_target_is_set_through_its_own_door_and_nothing_else_moves(client):
    from aughor.semantic import metrics as M
    before = M.definition_at("aov", CONN, "lux")
    r = client.put("/metrics/aov/target", params={"connection_id": CONN, "schema": "lux"}, json={
        "target_value": 400, "target_direction": "higher", "warning_threshold": 15, "critical_threshold": 40,
        "benchmark_source": "set by hand: a stretch aim"})
    assert r.status_code == 200, r.text
    m = M.definition_at("aov", CONN, "lux")
    assert (m.target_value, m.target_direction, m.warning_threshold, m.critical_threshold, m.benchmark_source) == (
        400, "higher", 15, 40, "set by hand: a stretch aim")
    # the definition, its governance and its dates are as they were — no confirmation stamped, no unit rewritten
    for field in ("sql", "status", "version", "approved_by", "unit", "time_column", "time_confirmed_by"):
        assert getattr(m, field) == getattr(before, field), field
    assert client.restated == [CONN]                 # a Briefing reads a target, so the stored ones are restated


def test_a_bad_target_is_refused_and_an_empty_one_clears(client):
    from aughor.semantic import metrics as M
    put = lambda body: client.put("/metrics/aov/target", params={"connection_id": CONN, "schema": "lux"}, json=body)
    assert put({"target_value": 400, "target_direction": "up"}).status_code == 422
    assert put({"target_value": 400, "warning_threshold": -1}).status_code == 422
    assert put({"target_value": 400, "warning_threshold": 40, "critical_threshold": 15}).status_code == 422
    assert put({"target_value": 400, "target_direction": "higher", "warning_threshold": 15}).status_code == 200
    assert put({"target_value": None, "target_direction": "higher", "warning_threshold": 15}).status_code == 200
    m = M.definition_at("aov", CONN, "lux")
    assert (m.target_value, m.target_direction, m.warning_threshold) == (None, None, None)
    assert client.put("/metrics/nope/target", params={"connection_id": CONN}, json={"target_value": 1}).status_code == 404


def test_the_scorecard_scores_only_the_connections_own_metrics(client, monkeypatch):
    from aughor.semantic import metrics as M
    client.put("/metrics/aov/target", params={"connection_id": CONN, "schema": "lux"}, json={
        "target_value": 400, "target_direction": "higher", "warning_threshold": 15, "critical_threshold": 40})

    class _Db:
        def close(self):
            pass
    monkeypatch.setattr("aughor.db.connection.open_connection_for", lambda conn: _Db())
    monkeypatch.setattr("aughor.routers.metrics.compute_value", lambda m, db: M.MetricValue(value=380.0, sql=""))
    rows = client.get(f"/connections/{CONN}/health-scorecard").json()
    assert [(r["name"], r["status"], r["target_direction"]) for r in rows] == [("aov", "yellow", "higher")]
    assert round(rows[0]["variance"], 3) == -0.05
