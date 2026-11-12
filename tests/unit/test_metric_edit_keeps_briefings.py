"""An edit that changes only a metric's owner keeps every stored Briefing (2026-11-08).

`PUT /metrics/{name}` dropped every cached Briefing of the connection on every save. A stored Briefing reads a
definition's figures and words, never its owner, so clearing gmv's stray owner ("scenario run 2026-10-25", written by
the 2026-10-25 scenario run) would have thrown away LuxExperience's stored edition, and the next reader would have paid
about five model steps to have it written again. Any other change still restates the Briefings, as before.
"""
from __future__ import annotations

import pytest

BODY = {"name": "gmv_owner_edit_test", "label": "GMV (EUR)", "connection": "owner-edit-conn", "tables": [],
        "sql": "SELECT SUM(total_eur) AS gmv FROM orders", "owner": "scenario run 2026-10-25"}


@pytest.fixture
def door(monkeypatch):
    from fastapi.testclient import TestClient

    import pramanyx.routers.metrics as MR
    from pramanyx.api import app
    from pramanyx.semantic.metrics import MetricDefinition

    existing = MetricDefinition(**{**BODY, "status": "approved", "version": 3, "approved_by": "ana",
                                   "time_kind": "flow", "time_column": "orders.order_date"})
    saved: list = []
    restated: list = []
    # The door is what is under test: nothing reaches the shared catalogue or the Briefing store.
    monkeypatch.setattr(MR, "_addressed", lambda *a, **k: existing)
    monkeypatch.setattr(MR, "save_metric", saved.append)
    monkeypatch.setattr(MR, "_restate_briefings", restated.append)
    return TestClient(app), saved, restated


def test_clearing_the_owner_keeps_the_stored_briefings(door):
    client, saved, restated = door
    res = client.put(f"/metrics/{BODY['name']}", json={**BODY, "owner": ""})
    assert res.status_code == 200, res.text
    assert saved and not saved[-1].owner and saved[-1].status == "approved"    # still approved, owner cleared
    assert saved[-1].time_column == "orders.order_date"                        # the dates carried, not sent
    assert restated == [], "an owner-only edit dropped the connection's stored Briefings"


def test_clearing_the_owner_from_the_editor_keeps_them_too(monkeypatch):
    """The editor sends EVERY field, the dates included. The first version of this guard was proven with a body that
    left the dates out, and the live save from the editor still dropped LuxExperience's stored edition (2026-11-08):
    the dates, re-sent unchanged by the person who had confirmed them, appended "; confirmed by" to their source."""
    from fastapi.testclient import TestClient

    import pramanyx.routers.metrics as MR
    from pramanyx.api import app
    from pramanyx.security.authz import caller
    from pramanyx.semantic.metrics import MetricDefinition

    me = caller()
    existing = MetricDefinition(**{**BODY, "status": "approved", "version": 3, "approved_by": "ana",
                                   "time_kind": "flow", "time_column": "orders.order_date",
                                   "time_confirmed_by": me, "time_source": f"set by {me} in the metric editor"})
    saved: list = []
    restated: list = []
    monkeypatch.setattr(MR, "_addressed", lambda *a, **k: existing)
    monkeypatch.setattr(MR, "save_metric", saved.append)
    monkeypatch.setattr(MR, "_restate_briefings", restated.append)
    as_the_editor_sends_it = {**BODY, "owner": "", "time_kind": "flow", "time_column": "orders.order_date"}
    res = TestClient(app).put(f"/metrics/{BODY['name']}", json=as_the_editor_sends_it)
    assert res.status_code == 200, res.text
    assert saved and not saved[-1].owner and saved[-1].time_source == f"set by {me} in the metric editor"
    assert restated == [], "an owner-only save from the editor dropped the connection's stored Briefings"


@pytest.mark.parametrize("change", [
    {"sql": "SELECT SUM(total_eur) - SUM(refund_eur) AS gmv FROM orders"},     # a figure
    {"label": "Gross merchandise value"},                                     # a word a Briefing prints
])
def test_any_other_edit_still_restates_them(door, change):
    client, saved, restated = door
    res = client.put(f"/metrics/{BODY['name']}", json={**BODY, **change})
    assert res.status_code == 200, res.text
    assert restated == ["owner-edit-conn"]
