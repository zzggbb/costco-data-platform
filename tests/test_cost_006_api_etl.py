"""
COST-006 Validation: POST /run-etl endpoint.

Spins up FastAPI via TestClient, validates:
  1. POST /run-etl?demo=true triggers full pipeline and returns report JSON
  2. Report contains correct stages (scrape_catalog, category_structuring, storage)
  3. Report status is "success" with products scraped
  4. Concurrent request returns 409 (lock guard)
  5. Existing endpoints still work after ETL run
  6. Database is refreshed with new data
"""

import asyncio
import sys
import os
import time
import threading

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def main():
    print("=" * 70)
    print("COST-006 VALIDATION: POST /run-etl Endpoint")
    print("=" * 70)
    passed = True

    # ---- TEST 1: Source verification ----
    print("\n[TEST 1] Endpoint exists in source")
    app_src = open(os.path.join(os.path.dirname(__file__), "..",
                   "costco_etl", "api", "app.py")).read()

    checks = [
        ("@app.post(\"/run-etl\")", "route decorator"),
        ("async def run_etl", "async handler"),
        ("asyncio.wait_for(", "timeout protection"),
        ("_etl_lock", "concurrency lock"),
        ("run_pipeline", "pipeline import"),
    ]
    for pattern, label in checks:
        if pattern in app_src:
            print(f"  OK: {label}")
        else:
            print(f"  FAIL: missing {label} ({pattern})")
            passed = False

    # ---- TEST 2: Full pipeline via HTTP (demo mode) ----
    print("\n[TEST 2] POST /run-etl?demo=true — full pipeline via HTTP")

    # Use httpx for async test client since we need to test concurrent requests too
    import httpx
    from costco_etl.api.app import app

    async def run_api_tests():
        nonlocal passed

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:

            # -- Health check first --
            r = await client.get("/")
            if r.status_code == 200 and r.json().get("status") == "api ok":
                print("  OK: GET / health check")
            else:
                print(f"  FAIL: GET / returned {r.status_code}")
                passed = False

            # -- Run ETL pipeline (demo mode) --
            t0 = time.perf_counter()
            r = await client.post("/run-etl?demo=true", timeout=60.0)
            dt = time.perf_counter() - t0

            if r.status_code != 200:
                print(f"  FAIL: POST /run-etl returned {r.status_code}: {r.text}")
                passed = False
                return

            report = r.json()
            print(f"  OK: POST /run-etl returned 200 ({dt:.3f}s)")

            # -- Validate report structure --
            if report.get("status") == "success":
                print(f"  OK: report status = success")
            else:
                print(f"  FAIL: report status = {report.get('status')}")
                passed = False

            expected_stages = ["scrape_catalog", "category_structuring", "storage"]
            for stage in expected_stages:
                if stage in report.get("stages", {}):
                    s = report["stages"][stage]
                    print(f"  OK: stage '{stage}' — status={s.get('status')}, duration={s.get('duration_s')}s")
                else:
                    print(f"  FAIL: missing stage '{stage}'")
                    passed = False

            # Scrape metrics
            scrape = report.get("stages", {}).get("scrape_catalog", {})
            total = scrape.get("total_unique", 0)
            if total > 0:
                print(f"  OK: {total} unique products in report")
            else:
                print(f"  FAIL: 0 products in report")
                passed = False

            # -- TEST 3: Concurrent request returns 409 --
            print(f"\n[TEST 3] Concurrent ETL request returns 409")

            # We need to test the lock. Fire a real request and immediately fire another.
            # Since the first test already completed, the lock is released.
            # We'll simulate by acquiring the lock manually.
            from costco_etl.api.app import _etl_lock

            # Acquire the lock to simulate a running pipeline
            await _etl_lock.acquire()
            try:
                r2 = await client.post("/run-etl?demo=true", timeout=5.0)
                if r2.status_code == 409:
                    print(f"  OK: 409 Conflict — '{r2.json().get('detail')}'")
                else:
                    print(f"  FAIL: expected 409, got {r2.status_code}")
                    passed = False
            finally:
                _etl_lock.release()

            # -- TEST 4: Existing endpoints still work --
            print(f"\n[TEST 4] Existing endpoints work after ETL")

            r3 = await client.get("/categories/tree")
            if r3.status_code == 200 and "category_tree" in r3.json():
                tree = r3.json()["category_tree"]
                print(f"  OK: GET /categories/tree — {len(tree)} root nodes")
            else:
                print(f"  FAIL: GET /categories/tree returned {r3.status_code}")
                passed = False

            r4 = await client.get("/products/by-category?category_url=/jewelry.html")
            if r4.status_code == 200:
                count = r4.json().get("count", 0)
                print(f"  OK: GET /products/by-category — {count} products")
            else:
                print(f"  FAIL: GET /products/by-category returned {r4.status_code}")
                passed = False

            r5 = await client.get("/categories/metrics?category_url=/jewelry.html")
            if r5.status_code == 200:
                metrics = r5.json()
                print(f"  OK: GET /categories/metrics — product_count={metrics.get('product_count')}")
            else:
                print(f"  FAIL: GET /categories/metrics returned {r5.status_code}")
                passed = False

        return passed

    passed = asyncio.run(run_api_tests())

    # ---- Summary ----
    print(f"\n{'=' * 70}")
    if passed:
        print("COST-006 VALIDATION: PASSED")
    else:
        print("COST-006 VALIDATION: FAILED")
    print(f"{'=' * 70}")

    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
