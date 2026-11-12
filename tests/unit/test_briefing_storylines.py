"""The Briefing as a running account (2026-11-12, the user: "Argue how actionable this is? And is it role based?").

A written edition is read as storylines: one per part of the business where a figure left its usual range, one per
decision of the Record it cites — each with its owner, its worth, its decision and its check, or which is missing.
Nothing is written by a model and nothing is stored: the owner is the metric's, the decision and its check are the
Record's. The shapes below are LuxExperience's week of 2–8 Nov 2026, cut down.
"""
import pytest

from pramanyx.briefing import storylines as S

CONN = "c_lux"


def _fig(fid, label, current, low, high, *, unit="EUR", outside=None, streak=1, extreme=None, floor=False, series=None, status="final"):
    way = current > high or current < low
    return {"id": fid, "label": label, "metric": fid, "metric_name": fid, "unit": unit, "better": "up", "current": current,
            "current_text": f"{current:,.2f}" if unit == "days" else f"{current:,.0f}", "status": status,
            "usual": {"low": low, "high": high, "mean": (low + high) / 2, "low_text": f"{low:,.2f}" if unit == "days" else f"{low:,.0f}",
                      "high_text": f"{high:,.2f}" if unit == "days" else f"{high:,.0f}"},
            "outside": way if outside is None else outside, "floor": floor, "streak": streak, "extreme": extreme,
            "series": series or [{"start": "2026-10-19", "value": low}, {"start": "2026-10-26", "value": high},
                                 {"start": "2026-11-02", "value": current}]}


def _edition(**over):
    delivery = _fig("order_to_delivery_days", "Average order-to-delivery days", 6.82, 6.41, 6.67, unit="days", streak=3, floor=True,
                    extreme={"which": "highest", "of": 9},
                    series=[{"start": "2026-10-12", "value": 6.37}, {"start": "2026-10-19", "value": 6.53},
                            {"start": "2026-10-26", "value": 6.65}, {"start": "2026-11-02", "value": 6.82}])
    transit = _fig("carrier_transit_days", "Average carrier transit days", 5.69, 5.24, 5.56, unit="days", streak=4)
    margin = _fig("contribution_margin", "Contribution margin", 80999, 72766, 78500, extreme={"which": "highest", "of": 9})
    orders = _fig("orders_count", "Orders placed", 284, 259, 293, unit="count")
    entry = {
        "period": {"period": "week", "measured": [orders, margin, transit, delivery]},
        "blocks": [
            {"id": "lead_1", "type": "lead", "text": "Delivery reached {6.823 days|order_to_delivery_days}."},
            {"id": "context_2", "type": "context", "source": "analysis_a", "text": "Express holds the rise."},
            {"id": "table_3", "type": "table", "source": "ship_service_level", "text": "Where the days sit."},
            {"id": "figure_4", "type": "figure", "source": "carrier_transit_days", "text": "A fourth straight rise."},
            {"id": "decision_5", "type": "decision", "text": "Set an alert on express transit at {4.356 days|analysis_a}."},
            {"id": "compare_6", "type": "compare", "source": "orders_by_platform", "text": "No storefront is far from normal."},
            {"id": "table_7", "type": "table", "source": "gmv_platform", "text": "Mytheresa held."},
            {"id": "context_8", "type": "context", "source": "decision_7b3f", "text": "The pause is due for review."},
            {"id": "context_9", "type": "context", "source": "discussion_1", "text": "It was argued both ways."},
            {"id": "figure_10", "type": "figure", "source": "contribution_margin", "text": "The highest of nine weeks."},
            {"id": "quiet_11", "type": "quiet", "text": "AOV held at {606|aov}."},
        ],
        "sources": {
            "analysis_a": {"id": "analysis_a", "kind": "analysis", "label": "Express transit holds the rise",
                           "rows": [["Express transit holds the rise", "Why did transit rise?", "2026-11-11"]],
                           "facts": {"headline": "Express transit +0.665 days holds the week's rise"}},
            "ship_service_level": {"id": "ship_service_level", "kind": "query", "label": "Transit by service level", "facts": {}},
            "orders_by_platform": {"id": "orders_by_platform", "kind": "breakdown", "label": "Orders by platform", "facts": {"check": "orders_count"}},
            "gmv_platform": {"id": "gmv_platform", "kind": "query", "label": "GMV by platform", "facts": {}},
            "decision_7b3f": {"id": "decision_7b3f", "kind": "decision", "label": "Paid social on Mytheresa",
                              "facts": {"decision_id": "7b3feaeb9b76", "chosen": "pause paid social on Mytheresa for October",
                                        "decided": "2026-10-26", "review_on": "2026-11-26", "outcome": ""}},
            "discussion_1": {"id": "discussion_1", "kind": "discussion", "label": "A document's comments",
                             "facts": {"said": "I'd keep it paused through October.", "who": "person:Sidha Sadhak",
                                       "where": "A document's comments", "when": "2026-10-26"}},
        },
    }
    entry.update(over)
    return entry


PLACE = {"orders_count": {"id": "demand", "name": "Demand", "order": 1}, "contribution_margin": {"id": "money", "name": "Money", "order": 4},
         "carrier_transit_days": {"id": "deliver", "name": "Deliver", "order": 3}, "order_to_delivery_days": {"id": "deliver", "name": "Deliver", "order": 3}}
PAUSE = {"id": "7b3feaeb9b76aa", "question": "Paid social on Mytheresa?", "chosen": "pause paid social on Mytheresa for October",
         "owner": "person:Sidha Sadhak", "decided_by": "person:Sidha Sadhak", "decided_at": "2026-10-26T03:05:51+00:00",
         "review_on": "2026-11-26", "expectation_claim": "", "outcome": "", "objective": "", "superseded_by": "",
         "source": {"kind": "declared", "ref": "x", "detail": "decided in a Slack thread"}}


def _by(out, sid):
    return next(s for s in out["storylines"] if s["id"] == sid)


def test_every_figure_sits_on_its_part_of_the_business_in_the_maps_order():
    out = S.build(_edition(), PLACE, {}, [])
    assert [(s["name"], s["figures"]) for s in out["stages"]] == [
        ("Demand", ["orders_count"]), ("Deliver", ["carrier_transit_days", "order_to_delivery_days"]), ("Money", ["contribution_margin"])]


def test_a_part_whose_figures_left_their_usual_range_is_one_storyline_led_by_the_farthest():
    out = S.build(_edition(), PLACE, {}, [])
    assert [s["id"] for s in out["storylines"]] == ["area:deliver", "area:money", "decision:decision_7b3f"]
    d = _by(out, "area:deliver")
    assert d["anchor"] == "order_to_delivery_days" and d["figures"] == ["order_to_delivery_days", "carrier_transit_days"]
    assert d["head"] == ("Average order-to-delivery days read 6.82, above its usual 6.41–6.67: the highest of 9 weeks and a "
                         "third straight rise.")
    assert d["state"] == "developing" and _by(out, "area:money")["state"] == "new"
    # orders stayed inside their usual range: a figure, on the line, and no storyline
    assert not any(s["stage"] == "demand" for s in out["storylines"])


def test_a_block_belongs_to_what_it_cites_or_follows_the_block_before_it():
    out = S.build(_edition(), PLACE, {}, [])
    # the lead opens on delivery, so the analysis and the query table after it are delivery's; the decision follows them
    assert _by(out, "area:deliver")["blocks"] == ["context_2", "table_3", "figure_4", "decision_5"]
    # a block about a figure that stayed inside its range ends the run: it and the table after it belong to no storyline
    assert out["rest"] == ["compare_6", "table_7", "quiet_11"]
    # a decision of the Record is its own storyline, and what was said about it follows it
    assert _by(out, "decision:decision_7b3f")["blocks"] == ["context_8", "context_9"]
    assert _by(out, "area:money")["blocks"] == ["figure_10"]
    # every block is somewhere: the lead is the page's opening, the rest is held or left where it was
    held = {b for s in out["storylines"] for b in s["blocks"]} | set(out["rest"]) | {"lead_1"}
    assert held == {b["id"] for b in _edition()["blocks"]}


def test_the_owner_is_the_metrics_and_a_storyline_without_one_says_so():
    out = S.build(_edition(), PLACE, {"contribution_margin": "Finance"}, [])
    money, deliver = _by(out, "area:money"), _by(out, "area:deliver")
    assert (money["owner"], money["owner_from"]) == ("Finance", "metric")
    assert (deliver["owner"], deliver["owner_from"]) == ("", "") and deliver["waits"]
    assert deliver["trail"][-1] == {"when": "", "kind": "open", "open": True, "says": "Nobody owns Average order-to-delivery days."}
    assert not any(t["kind"] == "open" for t in money["trail"])


def test_worth_is_priced_only_for_money_that_the_platform_calls_a_move():
    out = S.build(_edition(), PLACE, {}, [])
    money = _by(out, "area:money")["worth"]
    assert money["value"] == pytest.approx(2499) and money["text"] == "2,499" and "computed, not measured" in money["says"]
    assert _by(out, "area:deliver")["worth"] == {"value": None, "why": "not a money figure, so it is not priced"}
    # read outside its range but not called (a source that rewrites its history): never priced
    uncalled = _edition()
    uncalled["period"]["measured"][1]["outside"] = False
    w = _by(S.build(uncalled, PLACE, {}, []), "area:money")
    assert w["worth"]["value"] is None and "not called a move" in w["worth"]["why"] and w["called"] is False


def test_an_editions_proposal_is_a_decision_not_taken_and_nothing_is_checked():
    d = _by(S.build(_edition(), PLACE, {}, []), "area:deliver")
    assert d["decision"] == {"taken": False, "text": "Set an alert on express transit at 4.356 days.", "block": "decision_5"}
    assert d["check"]["state"] == "none"
    assert _by(S.build(_edition(), PLACE, {}, []), "area:money")["decision"] is None


def test_a_record_decision_names_its_owner_and_says_when_there_is_nothing_to_score():
    s = _by(S.build(_edition(), PLACE, {}, [PAUSE]), "decision:decision_7b3f")
    assert s["state"] == "decided" and s["owner"] == "Sidha Sadhak" and s["owner_from"] == "decision"
    assert s["decision"]["taken"] and s["decision"]["review_on"] == "2026-11-26" and s["decision"]["where"] == "decided in a Slack thread"
    # no expectation was declared before the fact: the review has nothing to score, and the page says so
    assert s["check"]["state"] == "unscored" and s["check"]["on"] == "2026-11-26" and "hindsight" in s["check"]["says"]
    assert [t["kind"] for t in s["trail"]] == ["decision", "discussion", "review"]
    assert s["trail"][1]["says"].startswith("Sidha Sadhak (A document's comments): “I'd keep it paused")
    booked = _by(S.build(_edition(), PLACE, {}, [{**PAUSE, "expectation_claim": "c1"}]), "decision:decision_7b3f")
    assert booked["check"]["state"] == "booked"


def test_a_decision_taken_on_a_storylines_metric_makes_it_decided_and_owned():
    taken = {**PAUSE, "id": "d9", "chosen": "set the express alert", "objective": "order_to_delivery_days", "owner": "group:Supply chain",
             "expectation_claim": "c9", "review_on": "2026-12-13"}
    d = _by(S.build(_edition(), PLACE, {"order_to_delivery_days": "Someone else"}, [taken]), "area:deliver")
    assert d["state"] == "decided" and d["decision"]["text"] == "set the express alert"
    assert (d["owner"], d["owner_from"]) == ("Supply chain", "decision")           # the decision's owner answers for it
    assert d["check"] == {"state": "booked", "on": "2026-12-13", "says": d["check"]["says"]} and not d["waits"]
    # the decision was taken after the edition was written, so the trail says it from the Record
    assert [(t["when"], t["kind"]) for t in d["trail"] if t["kind"] in ("decision", "review")] == [
        ("2026-10-26", "decision"), ("2026-12-13", "review")]
    # a superseded version of a decision is not the decision
    old = _by(S.build(_edition(), PLACE, {}, [{**taken, "superseded_by": "d10"}]), "area:deliver")
    assert old["state"] == "developing" and old["decision"]["taken"] is False


def test_an_edition_code_drew_still_has_its_storylines():
    """The model did not finish (LuxExperience's Finance and Leadership editions, 2026-11-12): six bare figures. The
    figures still say where the business left its usual range, so the page is not empty of things to act on."""
    bare = _edition(blocks=[{"id": "figure_0", "type": "figure", "source": "order_to_delivery_days", "by_code": True},
                            {"id": "figure_1", "type": "figure", "source": "contribution_margin", "by_code": True}])
    out = S.build(bare, PLACE, {}, [])
    assert [(s["id"], s["blocks"]) for s in out["storylines"]] == [("area:deliver", ["figure_0"]), ("area:money", ["figure_1"])]
    assert out["rest"] == []


def test_nothing_outside_and_no_decision_is_no_storyline():
    calm = _edition(blocks=[{"id": "quiet_1", "type": "quiet", "text": "All held."}])
    calm["period"]["measured"] = [_fig("orders_count", "Orders placed", 284, 259, 293, unit="count")]
    out = S.build(calm, PLACE, {}, [])
    assert out["storylines"] == [] and out["rest"] == ["quiet_1"] and len(out["stages"]) == 1


def test_a_metric_the_map_does_not_place_reads_on_its_kind():
    measured = [_fig("gmv", "GMV (EUR)", 10, 1, 5), _fig("mystery", "Thing", 10, 1, 5)]
    place = S.places(CONN, None, measured, metrics_fn=lambda: [], areas_fn=lambda *a: {})
    assert place["gmv"] == {"id": "kind:sales", "name": "Sales", "order": 10 ** 5}
    assert place["mystery"] == S.OTHER


def test_a_store_that_cannot_be_read_is_named_and_the_rest_stands(monkeypatch):
    def broken(*a, **k):
        raise RuntimeError("the registry is locked")
    monkeypatch.setattr(S, "owners", broken)
    monkeypatch.setattr(S, "places", lambda *a, **k: PLACE)
    monkeypatch.setattr("pramanyx.record.decisions.list_decisions", lambda **k: [])
    out = S.for_edition(CONN, None, _edition())
    assert out["account_unread"] == {"metric owners": "the registry is locked"}
    assert len(out["storylines"]) == 3 and all(s["owner"] == "" for s in out["storylines"] if s["kind"] == "figures")


@pytest.fixture
def client(monkeypatch, tmp_path):
    from pramanyx.semantic import metrics as M
    monkeypatch.setenv("PRAMANYX_METRICS_PATH", str(tmp_path / "metrics.instance.json"))
    monkeypatch.setenv("PRAMANYX_ACTION_APPROVAL", "0")
    M.save_metric(M.MetricDefinition(
        name="aov", connection=CONN, schema_name="lux", label="AOV", unit="EUR", sql="SELECT AVG(total) AS aov FROM orders",
        tables=["orders"], time_column="orders.order_date", status="approved", version=4, approved_by="finance"))
    restated: list[str] = []
    monkeypatch.setattr("pramanyx.routers.metrics._restate_briefings", restated.append)
    from fastapi.testclient import TestClient

    from pramanyx.api import app
    c = TestClient(app)
    c.restated = restated
    return c


def test_an_owner_is_set_through_its_own_door_and_nothing_else_moves(client):
    """The body the page sends: the owner and nothing else. A full edit re-sends the definition, and re-sent dates read
    as a person's confirmation; an owner is not something a stored Briefing reads, so no edition is restated."""
    from pramanyx.semantic import metrics as M
    before = M.definition_at("aov", CONN, "lux")
    r = client.put("/metrics/aov/owner", params={"connection_id": CONN, "schema": "lux"}, json={"owner": "  Supply   chain "})
    assert r.status_code == 200, r.text
    m = M.definition_at("aov", CONN, "lux")
    assert m.owner == "Supply chain"
    for field in ("sql", "status", "version", "approved_by", "unit", "time_column", "time_confirmed_by"):
        assert getattr(m, field) == getattr(before, field), field
    assert client.restated == []
    assert S.owners(CONN, "lux") == {"aov": "Supply chain"}
    # "" says nobody owns it
    assert client.put("/metrics/aov/owner", params={"connection_id": CONN, "schema": "lux"}, json={"owner": ""}).status_code == 200
    assert M.definition_at("aov", CONN, "lux").owner is None and S.owners(CONN, "lux") == {}


def test_an_owner_is_refused_for_a_metric_that_is_not_this_connections(client):
    assert client.put("/metrics/nope/owner", params={"connection_id": CONN}, json={"owner": "Finance"}).status_code == 404
    assert client.put("/metrics/aov/owner", params={"connection_id": CONN, "schema": "lux"}, json={"owner": "x" * 121}).status_code == 422
