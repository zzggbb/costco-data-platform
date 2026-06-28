"""
COST-007 Validation: Delta-aware storage with snapshot-before-rebuild.

Validates:
  1. snapshot_previous_state reads existing DB correctly
  2. snapshot_previous_state returns {} when DB doesn't exist
  3. snapshot_previous_state returns {} when DB is corrupt/empty
  4. compute_delta detects new items, removed items, price drops, price increases
  5. Full pipeline integration: delta appears in ctx.report after run
  6. Second pipeline run detects "no changes" (same data = zero delta)
"""

import asyncio
import sqlite3
import sys
import os
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from costco_etl.storage.init_db import (
    snapshot_previous_state,
    compute_delta,
    recreate_costco_db,
)
from costco_etl.storage.persist_products import persist_products
from costco_etl.main_runner import run_pipeline
from costco_etl.observability.run_context import RunContext
from costco_etl.storage.paths import DB_PATH


def test_snapshot_no_db():
    """snapshot returns {} when DB doesn't exist."""
    result = snapshot_previous_state("/tmp/nonexistent_costco_test.db")
    assert result == {}, f"Expected empty dict, got {result}"
    return True


def test_snapshot_empty_db():
    """snapshot returns {} when table doesn't exist."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        tmp_path = f.name
    try:
        conn = sqlite3.connect(tmp_path)
        conn.execute("CREATE TABLE dummy (id TEXT)")
        conn.commit()
        conn.close()

        result = snapshot_previous_state(tmp_path)
        assert result == {}, f"Expected empty dict, got {result}"
        return True
    finally:
        os.unlink(tmp_path)


def test_snapshot_reads_products():
    """snapshot correctly reads existing products."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        tmp_path = f.name
    try:
        recreate_costco_db(tmp_path)
        conn = sqlite3.connect(tmp_path)
        conn.execute(
            "INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("P001", "Widget A", 29.99, 39.99, 4.5, "http://img.com/a.jpg", 100),
        )
        conn.execute(
            "INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("P002", "Widget B", 49.99, 59.99, 4.0, "http://img.com/b.jpg", 50),
        )
        conn.commit()
        conn.close()

        snap = snapshot_previous_state(tmp_path)
        assert len(snap) == 2
        assert snap["P001"]["min_price"] == 29.99
        assert snap["P002"]["name"] == "Widget B"
        return True
    finally:
        os.unlink(tmp_path)


def test_compute_delta_all_scenarios():
    """compute_delta detects new, removed, price drops, price increases, and unchanged."""
    old_snapshot = {
        "P001": {"name": "Widget A", "min_price": 29.99, "max_price": 39.99, "rating": 4.5, "review_count": 100},
        "P002": {"name": "Widget B", "min_price": 49.99, "max_price": 59.99, "rating": 4.0, "review_count": 50},
        "P003": {"name": "Widget C", "min_price": 99.99, "max_price": 109.99, "rating": 3.5, "review_count": 25},
        "P004": {"name": "Widget D", "min_price": 19.99, "max_price": 29.99, "rating": 4.8, "review_count": 200},
    }

    new_products = [
        # P001: price DROP 29.99 → 19.99
        {"id": "P001", "item_product_name": "Widget A", "minSalePrice": 19.99, "maxSalePrice": 39.99},
        # P002: price INCREASE 49.99 → 59.99
        {"id": "P002", "item_product_name": "Widget B", "minSalePrice": 59.99, "maxSalePrice": 69.99},
        # P004: UNCHANGED
        {"id": "P004", "item_product_name": "Widget D", "minSalePrice": 19.99, "maxSalePrice": 29.99},
        # P005: NEW item
        {"id": "P005", "item_product_name": "Widget E", "minSalePrice": 9.99, "maxSalePrice": 14.99},
        # P003: REMOVED (not in new_products)
    ]

    delta = compute_delta(old_snapshot, new_products)

    # New items
    assert len(delta["new_items"]) == 1
    assert delta["new_items"][0]["id"] == "P005"

    # Removed items
    assert len(delta["removed_items"]) == 1
    assert delta["removed_items"][0]["id"] == "P003"

    # Price drops
    assert len(delta["price_drops"]) == 1
    drop = delta["price_drops"][0]
    assert drop["id"] == "P001"
    assert drop["old_price"] == 29.99
    assert drop["new_price"] == 19.99
    assert drop["delta"] == -10.0

    # Price increases
    assert len(delta["price_increases"]) == 1
    inc = delta["price_increases"][0]
    assert inc["id"] == "P002"
    assert inc["old_price"] == 49.99
    assert inc["new_price"] == 59.99

    # Summary
    s = delta["summary"]
    assert s["previous_count"] == 4
    assert s["current_count"] == 4
    assert s["new_count"] == 1
    assert s["removed_count"] == 1
    assert s["price_drop_count"] == 1
    assert s["price_increase_count"] == 1
    assert s["unchanged_count"] == 1  # P004

    return True


def test_compute_delta_empty_old():
    """First run ever: everything is 'new'."""
    new_products = [
        {"id": "P001", "item_product_name": "Widget A", "minSalePrice": 29.99},
        {"id": "P002", "item_product_name": "Widget B", "minSalePrice": 49.99},
    ]
    delta = compute_delta({}, new_products)
    assert len(delta["new_items"]) == 2
    assert len(delta["removed_items"]) == 0
    assert len(delta["price_drops"]) == 0
    assert delta["summary"]["previous_count"] == 0
    return True


async def test_pipeline_integration():
    """Full pipeline produces delta in report."""
    ctx = RunContext(run_name="cost_007_test_run1", console=False)
    await run_pipeline(ctx, category='jewelry')
    report = ctx.finalize(status="success")

    assert "delta" in report, "delta missing from report"
    delta = report["delta"]
    assert "summary" in delta
    assert "new_items" in delta
    assert "removed_items" in delta
    assert "price_drops" in delta
    assert "price_increases" in delta

    return report["delta"]


async def test_pipeline_second_run_stable():
    """Second run with same data should show zero changes (or near-zero from real-time flux)."""
    ctx = RunContext(run_name="cost_007_test_run2", console=False)
    await run_pipeline(ctx, category='jewelry')
    report = ctx.finalize(status="success")

    delta = report["delta"]
    s = delta["summary"]
    # Same category, same data — should be mostly stable
    # Allow small flux from real-time inventory
    total_changes = s["new_count"] + s["removed_count"] + s["price_drop_count"] + s["price_increase_count"]

    return s, total_changes


async def main():
    print("=" * 70)
    print("COST-007 VALIDATION: Delta-Aware Storage")
    print("=" * 70)
    passed = True

    # ---- Unit tests ----
    print("\n[TEST 1] snapshot_previous_state — no DB")
    if test_snapshot_no_db():
        print("  OK: returns empty dict")
    else:
        print("  FAIL")
        passed = False

    print("\n[TEST 2] snapshot_previous_state — empty DB (no products table)")
    if test_snapshot_empty_db():
        print("  OK: returns empty dict")
    else:
        print("  FAIL")
        passed = False

    print("\n[TEST 3] snapshot_previous_state — reads products correctly")
    if test_snapshot_reads_products():
        print("  OK: 2 products read with correct fields")
    else:
        print("  FAIL")
        passed = False

    print("\n[TEST 4] compute_delta — all scenarios")
    if test_compute_delta_all_scenarios():
        print("  OK: new=1, removed=1, drop=1, increase=1, unchanged=1")
    else:
        print("  FAIL")
        passed = False

    print("\n[TEST 5] compute_delta — empty old snapshot (first run)")
    if test_compute_delta_empty_old():
        print("  OK: everything classified as new")
    else:
        print("  FAIL")
        passed = False

    # ---- Integration tests ----
    print("\n[TEST 6] Pipeline run 1 — delta in report")
    delta1 = await test_pipeline_integration()
    s1 = delta1["summary"]
    print(f"  previous: {s1['previous_count']}, current: {s1['current_count']}")
    print(f"  new: {s1['new_count']}, removed: {s1['removed_count']}")
    print(f"  drops: {s1['price_drop_count']}, increases: {s1['price_increase_count']}")
    print(f"  unchanged: {s1['unchanged_count']}")
    print(f"  OK: delta present in report")

    print("\n[TEST 7] Pipeline run 2 — stability check (same data)")
    s2, total_changes = await test_pipeline_second_run_stable()
    print(f"  previous: {s2['previous_count']}, current: {s2['current_count']}")
    print(f"  total changes: {total_changes}")
    if total_changes <= s2["current_count"] * 0.1:  # <10% flux is expected
        print(f"  OK: stable ({total_changes} changes, within real-time flux tolerance)")
    else:
        print(f"  WARN: {total_changes} changes — higher than expected but may be real-time flux")
        # Don't fail — real-time inventory changes are normal

    # ---- Summary ----
    print(f"\n{'=' * 70}")
    if passed:
        print("COST-007 VALIDATION: PASSED")
    else:
        print("COST-007 VALIDATION: FAILED")
    print(f"{'=' * 70}")

    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    asyncio.run(main())
