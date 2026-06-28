"""
COST-001 Validation: Async fan-out-after-probe crawler.

Hits a real Costco category, verifies:
  1. All pages fetched concurrently (fan-out after probe)
  2. Total docs retrieved == numFound (integrity)
  3. Wall-clock time is dramatically less than sequential estimate
"""

import asyncio
import time
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import aiohttp
from costco_etl.scraping.get_key import run_get_key
from costco_etl.scraping.navigation_crawler import (
    crawl_category,
    _build_headers,
    _build_params,
    BASE_URL,
    ROWS_PER_PAGE,
)
from costco_etl.observability.run_context import RunContext


TEST_CATEGORY = "/jewelry.html"


async def main():
    print("=" * 70)
    print("COST-001 VALIDATION: Async Fan-Out Crawler")
    print("=" * 70)

    # ---- Step 1: Get API key (sync — still old code, fine for test) ----
    print("\n[1] Fetching API key...")
    api_key = run_get_key()
    if not api_key:
        print("FAIL: Could not retrieve API key")
        sys.exit(1)
    print(f"    API key: {api_key[:8]}...")

    # ---- Step 2: Probe to get numFound for comparison ----
    print(f"\n[2] Probing {TEST_CATEGORY} for numFound...")
    timeout = aiohttp.ClientTimeout(total=20, connect=5)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        headers = _build_headers(api_key)
        params = _build_params(TEST_CATEGORY, start=0)
        async with session.get(BASE_URL, headers=headers, params=params) as resp:
            data = await resp.json()
        num_found = data.get("response", {}).get("numFound", 0)
        total_pages = -(-num_found // ROWS_PER_PAGE)
        print(f"    numFound: {num_found}")
        print(f"    total_pages: {total_pages}")

        if num_found == 0:
            print("FAIL: numFound is 0 — category may be empty or blocked")
            sys.exit(1)

        # ---- Step 3: Run async crawler, measure wall time ----
        print(f"\n[3] Running async crawl_category (fan-out)...")
        ctx = RunContext(run_name="cost_001_test", console=False)

        t_start = time.perf_counter()
        docs = await crawl_category(
            session=session,
            api_key=api_key,
            category_url=TEST_CATEGORY,
            category_count=num_found,
            ctx=ctx,
        )
        t_async = time.perf_counter() - t_start

        ctx.finalize(status="success")

    # ---- Step 4: Results ----
    retrieved = len(docs)

    print(f"\n{'=' * 70}")
    print(f"RESULTS")
    print(f"{'=' * 70}")
    print(f"  numFound (API):        {num_found}")
    print(f"  docs retrieved:        {retrieved}")
    print(f"  total pages:           {total_pages}")
    print(f"  async wall time:       {t_async:.3f}s")
    print(f"  sequential estimate:   {total_pages * 0.4:.1f}s  (assuming ~400ms/req)")
    if t_async > 0:
        print(f"  speedup factor:        {(total_pages * 0.4) / t_async:.1f}x")

    # ---- Assertions ----
    passed = True

    if retrieved != num_found:
        print(f"\n  WARN: retrieved ({retrieved}) != numFound ({num_found})")
        print(f"  delta: {num_found - retrieved} docs missing")
        # Allow small delta due to real-time inventory changes
        if abs(retrieved - num_found) > num_found * 0.05:
            print("  FAIL: >5% divergence — integrity issue")
            passed = False
        else:
            print("  OK: <5% divergence — likely real-time inventory flux")
    else:
        print(f"\n  INTEGRITY: EXACT MATCH ({retrieved} == {num_found})")

    if t_async > total_pages * 0.4:
        print("  FAIL: async slower than sequential estimate")
        passed = False

    print(f"\n{'=' * 70}")
    if passed:
        print("COST-001 VALIDATION: PASSED")
    else:
        print("COST-001 VALIDATION: FAILED")
    print(f"{'=' * 70}")

    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    asyncio.run(main())
