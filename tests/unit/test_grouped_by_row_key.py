"""A total asked "by <dimension>" must not also be grouped by a row's own key.

Receipt 2026-11-13 (LuxExperience): "What is total GMV by order status?" → `GROUP BY order_id, status`,
500 rows, one per order. The detector feeds the repair round the lint already runs.
"""
from __future__ import annotations

import inspect

import pytest

from pramanyx.sql.grain_intent import grouped_by_a_row_key as check

_RECEIPT = ("SELECT order_id, status, ROUND(SUM(gmv_eur), 2) AS total_gmv_eur FROM orders "
            "GROUP BY order_id, status ORDER BY total_gmv_eur DESC")


def test_the_receipt_is_caught_and_the_repair_says_what_to_group_by():
    said = check("What is total GMV by order status?", _RECEIPT)
    assert said and "also groups by order_id" in said and "Group by status only" in said


@pytest.mark.parametrize("question, sql", [
    # the breakdown IS the entity: its key beside its name is right
    ("What are total sales by customer?", "SELECT customer_id, name, SUM(amount) FROM orders GROUP BY customer_id, name"),
    ("Total revenue by store and month", "SELECT store_id, month, SUM(x) FROM t GROUP BY store_id, month"),
    # the question asks per row
    ("What is the total per order by status?", _RECEIPT),
    ("Total GMV for each order by status", _RECEIPT),
    # the key is named
    ("What is total GMV by order id and status?", _RECEIPT),
    # no key in the grouping
    ("What is total GMV by order status?", "SELECT status, SUM(gmv_eur) FROM orders GROUP BY status"),
    ("What is total GMV by platform and status?", "SELECT platform, status, SUM(g) FROM orders GROUP BY platform, status"),
    # not an aggregate question, or no aggregate in the SQL
    ("List orders by status", _RECEIPT),
    ("What is total GMV by order status?", "SELECT order_id, status FROM orders GROUP BY order_id, status"),
    # positions and expressions are not this detector's to judge
    ("What is total GMV by order status?", "SELECT order_id, status, SUM(g) FROM orders GROUP BY 1, 2"),
    ("What is total GMV by order status?", "SELECT DATE_TRUNC('month', d), order_id, SUM(g) FROM o GROUP BY DATE_TRUNC('month', d), order_id"),
    ("", _RECEIPT), ("What is total GMV by order status?", ""),
])
def test_what_it_leaves_alone(question, sql):
    assert check(question, sql) is None


@pytest.mark.parametrize("question, sql, key", [
    ("What is the average basket by customer segment?", "SELECT customer_id, segment, AVG(b) FROM c GROUP BY customer_id, segment", "customer_id"),
    ("How many returns by product category?", "SELECT p.product_id, p.category, COUNT(*) FROM r JOIN p USING (product_id) GROUP BY p.product_id, p.category", "p.product_id"),
    ("Total amount by status", "SELECT id, status, SUM(amount) FROM payments GROUP BY id, status", "id"),
])
def test_other_breakdowns_grouped_by_a_key_are_caught(question, sql, key):
    said = check(question, sql)
    assert said and f"also groups by {key}" in said


def test_the_chat_path_runs_the_check():
    from pramanyx.routers import investigations
    src = inspect.getsource(investigations)
    assert "grouped_by_a_row_key" in src and '"grouped_by_row_key"' in src
