"""The glossary shortcut answers a question about what a TERM means, and nothing else.

The chat path answers a definitional question from the general glossary with no query. Receipt
2026-11-13, LuxExperience: "What is total GMV by order status?" came back as three glossary
entries — marketplaces, restaurant take rates, ``quantity * unit_price`` excluding cancelled
orders — on a connection whose approved GMV is ``SUM(gmv_eur)``, and nothing was run. Two things
were wrong: the test for "definitional" was the question's first words, and the general
glossary answered for a term the connection defines itself.
"""
from __future__ import annotations

import inspect

import pytest

from pramanyx.agent.question_shape import asks_what_a_term_means
from pramanyx.semantic.metrics import MetricDefinition

#: Every distinct question among the 500 most recent stored turns (2026-11-13) that the old
#: opener test called definitional. Each asks for figures.
ASKED_FOR_FIGURES = [
    "What is total GMV by order status?",
    "What is total GMV by platform?",
    "What is total GMV (EUR) by platform?",
    "What is the item return rate by product category, ranked from highest to lowest?",
    "what is average order value by month this year?",
    "What are total sales by region?",
    "What is our average order value by customer segment?",
    "What is the return rate by platform?",
    "What is DAU for last month?",
    "What is today's sales?",
    "What are the top 10 products by revenue?",
    "What is the total number of customers?",
    "What is the average review score by product category?",
    "What is the marketing ROAS by channel?",
    "What is the average delivery time in days from purchase to delivery for delivered orders?",
    "What is causing delivery delays?",
    "Explain analysis 0123abcd4567: which gates did the query behind that answer pass?",
    'Explain the metric "avg_carrier_transit_days": how it is computed here, and show its current value.',
    "What is the total marketing spend, total attributed revenue, and the overall blended ROAS?",
]

ASKED_FOR_A_MEANING = [
    "What is GMV?",
    "What does AOV mean?",
    "Define take rate",
    "Explain churn",
    "Meaning of net revenue",
    "What is a return rate?",
    "What are KPIs?",
    "What is customer lifetime value?",
]


@pytest.mark.parametrize("question", ASKED_FOR_FIGURES)
def test_a_question_for_figures_is_not_definitional_whatever_its_first_words(question):
    assert asks_what_a_term_means(question) is False


@pytest.mark.parametrize("question", ASKED_FOR_A_MEANING)
def test_a_question_about_what_a_term_means_still_is(question):
    assert asks_what_a_term_means(question) is True


@pytest.mark.parametrize("question", [
    "Explain how the loyalty programme changes what repeat customers buy after their first purchase",
    "What is the relationship of customer loyalty tiers to their preferred delivery options overall?",
])
def test_a_question_longer_than_a_term_is_about_the_data(question):
    assert asks_what_a_term_means(question) is False


@pytest.mark.parametrize("question", ["", "GMV?", "How many orders were placed?", "Show GMV", "Why is GMV down?"])
def test_a_question_that_does_not_open_as_one_never_was(question):
    assert asks_what_a_term_means(question) is False


# ── a connection's own word for the term beats the general glossary ──────────────────────

def _metrics(monkeypatch, *metrics):
    seen = {}

    def _list(path=None, connection_id=None, schema_name=None):
        seen["connection_id"], seen["schema_name"] = connection_id, schema_name
        return list(metrics)

    monkeypatch.setattr("pramanyx.semantic.metrics.list_metrics", _list)
    return seen


def test_a_question_names_a_metric_by_its_name_or_its_label(monkeypatch):
    from pramanyx.semantic.metrics import metrics_named_in
    gmv = MetricDefinition(name="gmv", label="GMV (EUR)", sql="SUM(gmv_eur)")
    aov = MetricDefinition(name="aov", label="Average order value", sql="AVG(x)")
    rate = MetricDefinition(name="item_return_rate", label="Item return rate", sql="AVG(r)")
    seen = _metrics(monkeypatch, gmv, aov, rate)
    assert [m.name for m in metrics_named_in("What is GMV?", "c1", "lux")] == ["gmv"]
    assert seen == {"connection_id": "c1", "schema_name": "lux"}          # this connection's, not everyone's
    assert [m.name for m in metrics_named_in("what is our average order value", "c1")] == ["aov"]
    assert [m.name for m in metrics_named_in("Define item_return_rate", "c1")] == ["item_return_rate"]
    assert [m.name for m in metrics_named_in("What is the item-return rate?", "c1")] == ["item_return_rate"]


def test_a_metric_is_named_as_whole_words_only(monkeypatch):
    from pramanyx.semantic.metrics import metrics_named_in
    _metrics(monkeypatch, MetricDefinition(name="rate", label="Rate", sql="AVG(r)"),
             MetricDefinition(name="gm", label="GM", sql="SUM(g)"))
    assert metrics_named_in("What is GMV?", "c1") == []              # "gm" is not in "gmv"
    assert metrics_named_in("What is a corporate tax?", "c1") == []  # "rate" is not in "corporate"
    assert metrics_named_in("What is churn?", "c1") == []


def test_a_proposed_or_retired_metric_is_still_the_connections_own_word(monkeypatch):
    from pramanyx.semantic.metrics import metrics_named_in
    _metrics(monkeypatch, MetricDefinition(name="churn", label="Churn", sql="AVG(c)", status="proposed"),
             MetricDefinition(name="nps", label="NPS", sql="AVG(n)", status="deprecated"))
    assert [m.name for m in metrics_named_in("What is churn?", "c1")] == ["churn"]
    assert [m.name for m in metrics_named_in("What does NPS mean?", "c1")] == ["nps"]


def test_the_chat_path_decides_definitional_by_both_and_not_by_the_first_words():
    """The two functions above only matter if the path asks them. The opener regex it used to
    carry inline must be gone, and the shortcut must sit behind both conditions."""
    from pramanyx.routers import investigations
    src = inspect.getsource(investigations)
    assert 'r"^(what is|what are|what does|define|explain|meaning of)"' not in src
    at = src.index("final_text path: definitional questions answered from KB")
    gate = src[at:src.index("has_strong_kb_match(question", at)]
    assert "asks_what_a_term_means(question)" in gate
    assert "metrics_named_in(question, connection_id" in gate
    assert "definitional = False" in gate        # metrics unreadable ⇒ the glossary does not answer
