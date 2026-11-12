"""PENDING item 29 (ROADMAP §6 item 62) — scores on objects, the SQL stand-in: the days since a customer's latest
order and how many orders it placed in the last 90 days, as governed formula properties over a to-many link.

The formula law could not express either (measured 2026-11-08 by reading): `_row_formula` refused every aggregate and
the path law (`column_at`) refused a to-many link, so "the latest date across a to-many link" and "a count within a
window across a to-many link" had no spelling. The smallest general capability is added — an aggregate across ONE
to-many link, pre-aggregated per key by the compiler — and the two scores are OFFERED from the ontology's shape
(`ontology.link_formulas`), never written: a person declares one through the expression door, which verifies it,
stamps the offer as its provenance and lets it wait in the draft.

Every value here is asserted exactly on a small DuckDB file whose dates are written relative to its own CURRENT_DATE,
including the window's boundary (89 days back is in, 90 is out, tomorrow is out), and checked against hand SQL.
"""
from __future__ import annotations

from pathlib import Path

import duckdb
import pytest

from pramanyx.db.connection import open_connection
from pramanyx.ontology import overrides as OV
from pramanyx.ontology.expressions import expression_problem, probe_expression
from pramanyx.ontology.link_formulas import formula_offers, offered_formula
from pramanyx.ontology.models import (
    Backing,
    EntityProperty,
    ExpressionProperty,
    OntologyEntity,
    OntologyGraph,
    OntologyRelationship,
)
from pramanyx.semantic.object_query import ObjectQueryRefused, compile_object_listing, compile_object_query

CONN = "lf-29"
RECENCY = "days_since_last_order"
WINDOW = "order_count_last_90_days"
RECENCY_SQL = "CURRENT_DATE - CAST(MAX(customer_to_order.placed_at) AS DATE)"
WINDOW_SQL = ("COUNT(CASE WHEN CURRENT_DATE - CAST(customer_to_order.placed_at AS DATE) BETWEEN 0 AND 89 "
              "THEN 1 END)")

#: Each customer's orders, as days before today (negative: after it) — late in the day, so a timestamp's date is what
#: is counted, never its hours.
ORDERS = {"C1": [3, 10, 89], "C2": [90, 120], "C3": [0, -1, 89], "C4": [], "C5": [89, 90]}
#: What the two formulas must read for each — the window keeps today and the 89 days before it.
EXPECTED = {"C1": (3, 3), "C2": (90, 0), "C3": (-1, 2), "C4": (None, 0), "C5": (89, 1)}


@pytest.fixture(scope="module")
def warehouse(tmp_path_factory) -> Path:
    path = tmp_path_factory.mktemp("lf29") / "shop.duckdb"
    con = duckdb.connect(str(path))
    con.execute("CREATE TABLE customers (customer_id VARCHAR, name VARCHAR)")
    # the link's two columns are named apart, so a join written on the wrong side cannot pass by a coincidence of names
    con.execute("CREATE TABLE orders (order_id VARCHAR, buyer_id VARCHAR, placed_at TIMESTAMP, amount DOUBLE)")
    n = 0
    for cid, days in ORDERS.items():
        con.execute("INSERT INTO customers VALUES (?, ?)", [cid, f"name {cid}"])
        for d in days:
            n += 1
            con.execute(f"INSERT INTO orders VALUES ('O{n}', '{cid}', "
                        f"CAST(CURRENT_DATE - INTERVAL ({d}) DAY AS TIMESTAMP) + INTERVAL 23 HOUR, 10.0)")
    con.execute("INSERT INTO orders VALUES ('O-none', NULL, CAST(CURRENT_DATE AS TIMESTAMP), 1.0)")   # no customer
    con.close()
    return path


@pytest.fixture
def db(warehouse):
    conn = open_connection("duckdb", str(warehouse), schema_name="main", connection_id=CONN)
    yield conn
    conn.close()


@pytest.fixture(autouse=True)
def _trees(tmp_path, monkeypatch):
    monkeypatch.setattr(OV, "_ROOT", tmp_path / "ontology_overrides")
    monkeypatch.setattr(OV, "_DRAFT_ROOT", tmp_path / "ontology_overrides_draft")


def _prop(name, data_type, role, key=False):
    return EntityProperty(name=name, data_type=data_type, semantic_type=role, is_primary_key=key)


def _graph(*, measured: bool = True, time: str = "placed_at") -> OntologyGraph:
    customer = OntologyEntity(
        id="Customer", display_name="Customer", source_tables=["customers"], identity_key="customer_id",
        grain_verified=True, backing=Backing(table="customers", primary_key="customer_id", verified=True),
        properties={"customer_id": _prop("customer_id", "VARCHAR", "key", True),
                    "name": _prop("name", "VARCHAR", "dimension")})
    order = OntologyEntity(
        id="Order", display_name="Order", source_tables=["orders"], identity_key="order_id", grain_verified=True,
        backing=Backing(table="orders", primary_key="order_id", verified=True), created_at_col=time or None,
        properties={"order_id": _prop("order_id", "VARCHAR", "key", True),
                    "buyer_id": _prop("buyer_id", "VARCHAR", "key"),
                    "placed_at": _prop("placed_at", "TIMESTAMP", "timestamp"),
                    "amount": _prop("amount", "DOUBLE", "measure")})
    rel = OntologyRelationship(
        id="Order_RELATES_TO_Customer", from_entity="Order", to_entity="Customer", cardinality="N:1",
        join_sql="orders.buyer_id = customers.customer_id", from_table="orders", from_col="buyer_id",
        to_table="customers", to_col="customer_id", join_confidence="verified", value_overlap=1.0,
        measured_cardinality="N:1" if measured else None)
    return OntologyGraph(connection_id=CONN, schema_name="main", schema_fingerprint="fp",
                         entities={"Customer": customer, "Order": order}, relationships={rel.id: rel})


def _declare(graph, type_id, name, expression, provenance=""):
    entity = graph.entities[type_id]
    entity.expressions[name] = ExpressionProperty(expression=expression, verified=True, provenance=provenance)
    entity.properties[name] = entity.expressions[name].as_property(name)


def _scored(graph):
    _declare(graph, "Customer", RECENCY, RECENCY_SQL)
    _declare(graph, "Customer", WINDOW, WINDOW_SQL)
    return graph


def _int(v):
    """A cell as a whole number — the display path spells SQL NULL "NULL"."""
    return None if v is None or str(v).strip().upper() == "NULL" else int(float(v))


def _pairs(rows) -> dict:
    return {str(r[0]): (_int(r[1]), _int(r[2])) for r in rows}


def _listed(db, graph) -> dict:
    compiled = compile_object_listing({"entity": "customer", "columns": [RECENCY, WINDOW], "limit": 50}, graph)
    result = db.execute("probe", compiled.sql)
    assert result.error is None, result.error
    return _pairs(result.rows)


# ── what the formula law could not say, and now says ──────────────────────────────────────────

def test_the_latest_date_and_the_window_count_across_a_to_many_link_are_exact_per_object(db):
    assert _listed(db, _scored(_graph())) == EXPECTED


def test_they_agree_with_hand_sql_and_never_multiply_the_objects(db):
    graph = _scored(_graph())
    hand = _pairs(db.execute("hand", """
        SELECT c.customer_id, CURRENT_DATE - CAST(MAX(o.placed_at) AS DATE),
               COUNT(CASE WHEN CAST(o.placed_at AS DATE) BETWEEN CURRENT_DATE - 89 AND CURRENT_DATE THEN 1 END)
        FROM customers c LEFT JOIN orders o ON o.buyer_id = c.customer_id GROUP BY 1""").rows)
    assert _listed(db, graph) == hand
    rows = db.execute("probe", compile_object_query(
        {"object_type": "customer", "measures": [{"name": "n", "agg": "count"},
                                                 {"name": "in_window", "agg": "sum", "path": WINDOW}]},
        graph).sql).rows
    assert [_int(v) for v in rows[0]] == [5, 6]          # five customers, not one row per order; 3 + 0 + 2 + 0 + 1


def test_a_score_is_a_filter_and_a_grouping_like_any_property(db):
    graph = _scored(_graph())
    active = db.execute("probe", compile_object_query(
        {"object_type": "customer", "filters": [{"path": WINDOW, "op": ">=", "value": 1}],
         "measures": [{"name": "n", "agg": "count"}]}, graph).sql).rows
    assert _int(active[0][0]) == 3                        # C1, C3, C5
    lapsed = db.execute("probe", compile_object_query(
        {"object_type": "customer", "filters": [{"path": RECENCY, "op": ">=", "value": 90}],
         "measures": [{"name": "n", "agg": "count"}]}, graph).sql).rows
    assert _int(lapsed[0][0]) == 1                        # C2; C4 has no order, so no recency to compare


def test_a_score_read_through_a_to_one_link_carries_its_value_to_each_linked_object(db):
    graph = _scored(_graph())
    rows = db.execute("probe", compile_object_query(
        {"object_type": "order", "filters": [{"path": "order_id", "value": "O1"}],
         "by": [f"order_to_customer.{RECENCY}"], "measures": [{"name": "n", "agg": "count"}]}, graph).sql).rows
    assert [(_int(r[0]), _int(r[1])) for r in rows] == [(3, 1)]          # O1 is C1's; C1's latest was 3 days ago


# ── what stays refused, with why ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("formula, why", [
    ("COUNT(*)", "aggregate over the type's own rows"),
    ("MAX(name)", "aggregates 'name', the object's own"),
    ("MAX(customer_to_order.placed_at) - MAX(customer_to_order.amount + LENGTH(name))", "the object's own"),
    ("MAX(MAX(customer_to_order.amount))", "an aggregate inside an aggregate"),
    ("COUNT(customer_to_order.order_id) FILTER (WHERE customer_to_order.amount > 1)", "FILTER clause"),
    ("STDDEV(customer_to_order.amount)", "COUNT, SUM, AVG, MIN or MAX"),
    ("MAX(customer_to_order.amount + elsewhere.amount)", "reading 2 links"),
])
def test_an_aggregate_that_is_not_one_links_rows_per_object_is_refused(formula, why):
    graph = _graph()
    _declare(graph, "Customer", "x", formula)
    with pytest.raises(ObjectQueryRefused, match=why):
        compile_object_query({"object_type": "customer", "by": ["x"], "measures": [{"agg": "count"}]}, graph)
    assert why in expression_problem(graph.entities["Customer"], "x", {"expression": formula,
                                                                       "semantic_type": "measure"}, graph)


def test_an_aggregate_across_a_to_one_link_or_an_unmeasured_one_is_refused():
    graph = _graph()
    _declare(graph, "Order", "x", "MAX(order_to_customer.name)")
    with pytest.raises(ObjectQueryRefused, match="a to-one link"):
        compile_object_query({"object_type": "order", "by": ["x"], "measures": [{"agg": "count"}]}, graph)
    unmeasured = _graph(measured=False)
    why = expression_problem(unmeasured.entities["Customer"], RECENCY, {"expression": RECENCY_SQL,
                                                                        "semantic_type": "measure"}, unmeasured)
    assert "never been measured" in why


def test_a_sum_across_the_link_of_a_reading_at_a_moment_is_refused_as_through_any_link():
    from pramanyx.ontology.models import SemiAdditive
    graph = _graph()
    graph.entities["Order"].semiadditive = {"amount": SemiAdditive(over="placed_at")}
    _declare(graph, "Customer", "x", "SUM(customer_to_order.amount)")
    with pytest.raises(ObjectQueryRefused, match="a reading at a moment"):
        compile_object_query({"object_type": "customer", "by": ["x"], "measures": [{"agg": "count"}]}, graph)
    _declare(graph, "Customer", "y", "MAX(customer_to_order.amount)")         # the latest reading is one moment
    compile_object_query({"object_type": "customer", "by": ["y"], "measures": [{"agg": "count"}]}, graph)


def test_a_formula_that_reaches_itself_across_a_link_is_refused_with_the_chain():
    graph = _graph()
    _declare(graph, "Customer", "loop_a", "MAX(customer_to_order.loop_b)")
    _declare(graph, "Order", "loop_b", "order_to_customer.loop_a + 1")
    with pytest.raises(ObjectQueryRefused, match=r"reaches itself \(Customer.loop_a → Order.loop_b → Customer.loop_a\)"):
        compile_object_query({"object_type": "customer", "by": ["loop_a"], "measures": [{"agg": "count"}]}, graph)


# ── offered from the ontology's shape, never written ──────────────────────────────────────────

def test_the_two_formulas_are_offered_on_the_type_with_the_to_many_link_to_a_dated_type():
    offers = formula_offers(_graph())
    assert [(o["entity"], o["link"], o["to"], o["time"]) for o in offers["offers"]] == [
        ("Customer", "customer_to_order", "Order", "placed_at")]
    formulas = {f["name"]: f for f in offers["offers"][0]["formulas"]}
    assert formulas[RECENCY]["expression"] == RECENCY_SQL and formulas[WINDOW]["expression"] == WINDOW_SQL
    assert all(f["status"] == "offered" and f["provenance"].startswith("offered by the platform") for f in formulas.values())
    assert formulas[RECENCY]["declare"] == {
        "method": "PUT", "path": f"/ontology/entities/Customer/expressions/{RECENCY}",
        "body": {"expression": RECENCY_SQL, "semantic_type": "measure", "unit": "days",
                 "description": formulas[RECENCY]["description"]}}
    assert offers["not_offered"] == []


def test_a_link_not_offered_is_said_with_why():
    unmeasured = formula_offers(_graph(measured=False))
    assert unmeasured["offers"] == [] and len(unmeasured["not_offered"]) == 1         # said once, for the link
    assert "never been measured" in unmeasured["not_offered"][0]["why"]
    both = formula_offers(_graph(measured=False, time=""))          # a link that cannot be crossed is said as that first
    assert [("never been measured" in n["why"]) for n in both["not_offered"]] == [True]
    undated = formula_offers(_graph(time=""))
    assert undated["offers"] == [] and undated["not_offered"][0]["why"] == "Order names no time, so nothing dates its objects"
    other_engine = formula_offers(_graph(), dialect="mysql")
    assert other_engine["offers"] == [] and "on mysql a person declares them by hand" in other_engine["not_offered"][0]["why"]


def test_two_links_on_the_same_columns_are_one_join_read_through_the_name_a_person_gave_it(db):
    """theLook's shape, measured live 2026-11-08: the builder's link and a person's declared one on the same columns
    share the mechanical reverse name (`user_to_order`), which the compiler refuses as naming two links."""
    graph = _graph()
    found = graph.relationships["Order_RELATES_TO_Customer"]
    graph.relationships["Order_placed_by_Customer"] = found.model_copy(update={
        "id": "Order_placed_by_Customer", "origin": "human", "name": "placed_by", "name_origin": "human",
        "api_name": "placed_by", "reverse_api_name": "customer_to_order"})
    offers = formula_offers(graph)
    assert [(o["link"], o["to"]) for o in offers["offers"]] == [("placed_by", "Order")]
    assert [(n["link"], n["why"]) for n in offers["not_offered"]] == [
        ("customer_to_order", "it joins on the same columns as placed_by, which is read instead")]
    for f in offers["offers"][0]["formulas"]:
        assert "placed_by.placed_at" in f["expression"]
        _declare(graph, "Customer", f["name"], f["expression"])
    assert _listed(db, graph) == EXPECTED


def test_on_bigquery_the_days_are_counted_through_unix_date():
    offers = formula_offers(_graph(), dialect="bigquery")
    formulas = {f["name"]: f["expression"] for f in offers["offers"][0]["formulas"]}
    assert formulas[RECENCY] == ("UNIX_DATE(CURRENT_DATE) - UNIX_DATE(CAST(MAX(customer_to_order.placed_at) AS "
                                 "DATE))")


def test_a_declared_offer_reads_declared_and_is_offered_no_more():
    graph = _scored(_graph())
    offers = formula_offers(graph)
    assert len(offers["offers"]) == 1 and offers["not_offered"] == [], offers
    formulas = offers["offers"][0]["formulas"]
    assert {f["name"]: f["status"] for f in formulas} == {RECENCY: "declared", WINDOW: "declared"}
    assert all("declare" not in f for f in formulas)


def test_each_offer_verifies_through_the_compiler_on_the_objects(db):
    graph = _graph()
    for f in formula_offers(graph)["offers"][0]["formulas"]:
        verdict = probe_expression(db, graph, graph.entities["Customer"], f["expression"], name=f["name"])
        assert verdict["bound"] is True and verdict["rows_checked"] == 5, verdict


def test_the_offer_the_door_stamps_is_read_from_the_graph_and_never_from_a_caller():
    graph = _graph()
    customer = graph.entities["Customer"]
    assert offered_formula(graph, customer, RECENCY, RECENCY_SQL)["provenance"].startswith("offered by the platform")
    assert offered_formula(graph, customer, RECENCY, RECENCY_SQL.replace("MAX", "MIN")) is None
    assert offered_formula(graph, customer, "my_own_name", RECENCY_SQL) is None


# ── a person declares it: the door verifies, stamps the offer, and the change waits in the draft ─────────────

def _door(monkeypatch, warehouse, graph):
    import pramanyx.db.connection as DBC
    import pramanyx.govern as G
    import pramanyx.routers.ontology as RO
    monkeypatch.setattr(RO, "_get_ontology_graph", lambda cid, schema=None: graph)
    monkeypatch.setattr(G, "guard", lambda *a, **k: None)
    monkeypatch.setattr(DBC, "open_connection_for_with_schema",
                        lambda cid, schema: open_connection("duckdb", str(warehouse), schema_name="main",
                                                            connection_id=CONN))
    return RO


def test_declaring_an_offer_writes_it_with_the_offer_as_provenance_and_who_declared_it(monkeypatch, warehouse):
    from pramanyx.security.authz import caller
    RO = _door(monkeypatch, warehouse, _graph())
    out = RO.declare_ontology_expression("Customer", RECENCY, RO._ExpressionSpec(
        expression=RECENCY_SQL, semantic_type="measure", unit="days"), connection_id=CONN, schema_name="main")
    assert out["expression"]["verified"] is True
    with OV.viewing("published"):
        assert OV.find_override(CONN, "main", "entity", "Customer") is None        # nothing reaches a reader yet
    with OV.viewing("draft"):
        ov = OV.find_override(CONN, "main", "entity", "Customer")
    spec = ov.fields["expressions"][RECENCY]
    said = spec.get("provenance", "")
    assert said.startswith("offered by the platform from the ontology's shape")
    assert "customer_to_order" in said and "no model wrote it" in said
    assert ov.edited_by == caller() and ov.binding["expressions"][RECENCY]["bound"] is True
    assert [k for k, *_ in OV.draft_entries(CONN, "main")] == ["entity"]


def test_a_formula_the_platform_did_not_offer_carries_no_provenance(monkeypatch, warehouse):
    RO = _door(monkeypatch, warehouse, _graph())
    RO.declare_ontology_expression("Customer", "first_order_days", RO._ExpressionSpec(
        expression="CURRENT_DATE - CAST(MIN(customer_to_order.placed_at) AS DATE)", semantic_type="measure"),
        connection_id=CONN, schema_name="main")
    with OV.viewing("draft"):
        spec = OV.find_override(CONN, "main", "entity", "Customer").fields["expressions"]["first_order_days"]
    assert "provenance" not in spec


# ── shown on the object page ───────────────────────────────────────────────────────────────────

def test_the_object_page_shows_both_scores_with_where_they_came_from(db):
    from pramanyx.semantic.object_instances import get_object
    graph = _graph()
    offered = {f["name"]: f for f in formula_offers(graph)["offers"][0]["formulas"]}
    for name in (RECENCY, WINDOW):
        _declare(graph, "Customer", name, offered[name]["expression"], provenance=offered[name]["provenance"])
    for pk, (days, count) in EXPECTED.items():
        shown = {p["name"]: p for p in get_object(graph, db, "customer", pk).properties if p.get("formula")}
        assert _int(shown[RECENCY]["value"]) == days, pk
        assert _int(shown[WINDOW]["value"]) == count, pk
    assert shown[RECENCY]["formula"] == {"expression": RECENCY_SQL, "kind": "expression",
                                         "provenance": offered[RECENCY]["provenance"]}


# ── on a real file: the samples warehouse ──────────────────────────────────────────────────────

def test_on_the_samples_warehouse_the_offers_are_what_its_shape_holds_and_equal_hand_sql(tmp_path):
    import json

    from pramanyx.demo.setup import _seed_ecommerce
    graph = OntologyGraph.model_validate(json.loads(
        (Path(__file__).resolve().parents[2] / "evals" / "ablation_samples_ecommerce_ontology_measured.json").read_text()))
    offers = formula_offers(graph)
    assert sorted((o["entity"], o["link"], o["time"]) for o in offers["offers"]) == [
        ("Customer", "customer_to_order", "order_date"), ("Customer", "customer_to_review", "review_date")]
    assert {(n["entity"], n["link"]) for n in offers["not_offered"]} >= {("Order", "order_to_order_item")}
    path = tmp_path / "samples.duckdb"
    con = duckdb.connect(str(path))
    _seed_ecommerce(con)
    con.close()
    db = open_connection("duckdb", str(path), schema_name="ecommerce", connection_id="lf-29-samples")
    try:
        order = next(o for o in offers["offers"] if o["link"] == "customer_to_order")
        for f in order["formulas"]:
            _declare(graph, "Customer", f["name"], f["expression"])
        compiled = compile_object_listing({"entity": "customer", "columns": [f["name"] for f in order["formulas"]],
                                           "limit": 200}, graph)
        got = _pairs(db.execute("p", compiled.sql).rows)
        hand = _pairs(db.execute("h", f"""
            SELECT c.customer_id, CURRENT_DATE - CAST(MAX(o.order_date) AS DATE),
                   COUNT(CASE WHEN CAST(o.order_date AS DATE) BETWEEN CURRENT_DATE - 89 AND CURRENT_DATE THEN 1 END)
            FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id
            WHERE c.customer_id IN ({', '.join(repr(k) for k in got)}) GROUP BY 1""").rows)
        assert got == hand and len(got) == 200
    finally:
        db.close()
