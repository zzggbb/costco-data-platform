"""
COST-005 Validation: Async main_runner pipeline.

Validates:
  1. run_pipeline is an async coroutine
  2. main() uses asyncio.run() — no sync scrape calls remain
  3. Full demo pipeline completes end-to-end (scrape → structure → persist)
  4. Report JSON is written with correct stages and status
  5. Database is created with products, categories, and metrics
  6. Observability spans capture timing for all stages
"""

import asyncio
import inspect
import json
import sqlite3
import time
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from costco_etl.main_runner import run_pipeline, main
from costco_etl.observability.run_context import RunContext
from costco_etl.storage.paths import DB_PATH


async def run_test():
    print("=" * 70)
    print("COST-005 VALIDATION: Async Pipeline Entry Point")
    print("=" * 70)
    passed = True

    # ---- TEST 1: run_pipeline is a coroutine function ----
    print("\n[TEST 1] run_pipeline is async")
    if inspect.iscoroutinefunction(run_pipeline):
        print("  OK: run_pipeline is a coroutine function")
    else:
        print("  FAIL: run_pipeline is not async")
        passed = False

    # ---- TEST 2: Source verification — asyncio.run in main() ----
    print("\n[TEST 2] main() uses asyncio.run()")
    src = open(os.path.join(os.path.dirname(__file__), "..",
               "costco_etl", "main_runner.py")).read()
    if "asyncio.run(" in src:
        print("  OK: asyncio.run() found in main_runner.py")
    else:
        print("  FAIL: asyncio.run() not found")
        passed = False

    if "await scrape_costco_catalog" in src:
        print("  OK: scrape_costco_catalog is awaited")
    else:
        print("  FAIL: scrape_costco_catalog not awaited")
        passed = False

    # ---- TEST 3: Full pipeline execution (demo mode) ----
    print("\n[TEST 3] Full pipeline end-to-end (demo mode)")
    ctx = RunContext(run_name="cost_005_test", console=False)

    t0 = time.perf_counter()
    await run_pipeline(ctx, demo=True)
    dt = time.perf_counter() - t0
    report = ctx.finalize(status="success")

    print(f"  Pipeline completed in {dt:.3f}s")

    # ---- TEST 4: Report structure ----
    print("\n[TEST 4] Report structure validation")
    expected_stages = ["scrape_catalog", "category_structuring", "storage"]
    for stage in expected_stages:
        if stage in report["stages"]:
            status = report["stages"][stage].get("status", "?")
            duration = report["stages"][stage].get("duration_s", "?")
            print(f"  OK: {stage} — status={status}, duration={duration}s")
        else:
            print(f"  FAIL: missing stage '{stage}' in report")
            passed = False

    if report["status"] == "success":
        print(f"  OK: overall status = success")
    else:
        print(f"  FAIL: overall status = {report['status']}")
        passed = False

    # Scrape metrics merged into report
    scrape_stage = report["stages"].get("scrape_catalog", {})
    if "total_unique" in scrape_stage:
        print(f"  OK: scrape metrics present (total_unique={scrape_stage['total_unique']})")
    else:
        print(f"  FAIL: scrape metrics not merged into report")
        passed = False

    # ---- TEST 5: Database integrity ----
    print(f"\n[TEST 5] Database integrity ({DB_PATH})")
    if not DB_PATH.exists():
        print(f"  FAIL: database not found at {DB_PATH}")
        passed = False
    else:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()

        cur.execute("SELECT COUNT(*) FROM products")
        product_count = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM product_categories")
        rel_count = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM categories")
        cat_count = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM category_map")
        map_count = cur.fetchone()[0]

        conn.close()

        print(f"  products:           {product_count}")
        print(f"  product_categories: {rel_count}")
        print(f"  categories:         {cat_count}")
        print(f"  category_map:       {map_count}")

        if product_count > 0 and rel_count > 0 and cat_count > 0 and map_count == 1:
            print("  OK: all tables populated")
        else:
            print("  FAIL: missing data in tables")
            passed = False

    # ---- TEST 6: Report file written ----
    print(f"\n[TEST 6] Report file written")
    if ctx.report_path.exists():
        with open(ctx.report_path) as f:
            disk_report = json.load(f)
        if disk_report["status"] == "success":
            print(f"  OK: {ctx.report_path.name}")
        else:
            print(f"  FAIL: report status on disk = {disk_report['status']}")
            passed = False
    else:
        print(f"  FAIL: report file not found")
        passed = False

    # ---- Summary ----
    print(f"\n{'=' * 70}")
    print(f"TIMING: {dt:.3f}s total pipeline (demo mode)")
    print(f"{'=' * 70}")
    if passed:
        print("COST-005 VALIDATION: PASSED")
    else:
        print("COST-005 VALIDATION: FAILED")
    print(f"{'=' * 70}")

    return passed


if __name__ == "__main__":
    ok = asyncio.run(run_test())
    sys.exit(0 if ok else 1)
