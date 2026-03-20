"""
COST-003 + COST-004 Validation: Native async get_key and get_megamenu.

Validates:
  1. run_get_key(session) returns a valid API key via native aiohttp (no to_thread)
  2. run_get_megamenu(session, api_key) returns megamenu JSON via native aiohttp
  3. Megamenu contains 'megaMenu' key with parseable category tree
  4. Full pipeline demo-mode still works end-to-end with zero sync bridges
  5. Single shared session used across all steps (connection reuse)
"""

import asyncio
import time
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import aiohttp
from costco_etl.scraping.get_key import run_get_key, extract_api_key
from costco_etl.scraping.get_megamenu import run_get_megamenu
from costco_etl.scraping.parse_megamenu import run_parse_megamenu
from costco_etl.scraping.costco_scraper import scrape_costco_catalog
from costco_etl.observability.run_context import RunContext


async def main():
    print("=" * 70)
    print("COST-003 + COST-004 VALIDATION: Native Async I/O")
    print("=" * 70)
    passed = True

    timeout = aiohttp.ClientTimeout(total=15, connect=5)

    async with aiohttp.ClientSession(timeout=timeout) as session:

        # ---- TEST 1: run_get_key (COST-003) ----
        print("\n[TEST 1] run_get_key — native async")
        t0 = time.perf_counter()
        api_key = await run_get_key(session)
        dt_key = time.perf_counter() - t0

        if api_key and len(api_key) > 10:
            print(f"  OK: api_key = {api_key[:12]}...  ({dt_key:.3f}s)")
        else:
            print(f"  FAIL: api_key = {api_key!r}")
            passed = False

        # Verify extract_api_key still works standalone (unit)
        assert extract_api_key('') is None, "extract_api_key should return None on empty"
        fake = r'\"authentification_token\":\"abc12345-def6-7890-abcd-ef1234567890\"'
        assert extract_api_key(fake) == "abc12345-def6-7890-abcd-ef1234567890"
        print("  OK: extract_api_key unit tests pass")

        # ---- TEST 2: run_get_megamenu (COST-004) ----
        print("\n[TEST 2] run_get_megamenu — native async")
        t0 = time.perf_counter()
        megamenu = await run_get_megamenu(session, api_key)
        dt_menu = time.perf_counter() - t0

        if isinstance(megamenu, dict) and "megaMenu" in megamenu:
            root_count = len(megamenu["megaMenu"])
            print(f"  OK: megaMenu has {root_count} root nodes  ({dt_menu:.3f}s)")
        else:
            print(f"  FAIL: unexpected megamenu shape: {type(megamenu)}")
            passed = False

        # Verify parse still works on async-fetched data
        parsed = run_parse_megamenu(megamenu)
        if parsed and len(parsed) > 100:
            print(f"  OK: parse_megamenu produced {len(parsed)} categories")
        else:
            print(f"  FAIL: parse_megamenu returned {len(parsed)} categories")
            passed = False

        # ---- TEST 3: ValueError on empty key ----
        print("\n[TEST 3] run_get_megamenu rejects empty api_key")
        try:
            await run_get_megamenu(session, "")
            print("  FAIL: should have raised ValueError")
            passed = False
        except ValueError:
            print("  OK: ValueError raised as expected")

    # ---- TEST 4: Full pipeline integration (demo mode) ----
    print("\n[TEST 4] Full pipeline demo mode — zero sync bridges")
    ctx = RunContext(run_name="cost_003_004_test", console=False)

    t0 = time.perf_counter()
    products, parsed_mega, metrics = await scrape_costco_catalog(ctx, demo=True)
    dt_pipeline = time.perf_counter() - t0
    ctx.finalize(status="success")

    if metrics["total_unique"] > 0 and len(parsed_mega) > 100:
        print(f"  OK: {metrics['total_unique']} products, {len(parsed_mega)} categories  ({dt_pipeline:.3f}s)")
    else:
        print(f"  FAIL: products={metrics['total_unique']}, categories={len(parsed_mega)}")
        passed = False

    # ---- TEST 5: Verify no sync imports remain in modules ----
    print("\n[TEST 5] No 'import requests' in async modules")
    import importlib
    import costco_etl.scraping.get_key as gk_mod
    import costco_etl.scraping.get_megamenu as gm_mod
    import costco_etl.scraping.navigation_crawler as nc_mod
    import costco_etl.scraping.costco_scraper as cs_mod

    for name, mod in [("get_key", gk_mod), ("get_megamenu", gm_mod),
                      ("navigation_crawler", nc_mod), ("costco_scraper", cs_mod)]:
        src = open(mod.__file__, "r").read()
        if "import requests" in src:
            print(f"  FAIL: {name} still imports requests")
            passed = False
        else:
            print(f"  OK: {name} — no requests import")

    # Also verify no asyncio.to_thread in scraper
    scraper_src = open(cs_mod.__file__, "r").read()
    if "to_thread" in scraper_src:
        print("  FAIL: costco_scraper still uses to_thread")
        passed = False
    else:
        print("  OK: costco_scraper — no to_thread bridges")

    # ---- Summary ----
    print(f"\n{'=' * 70}")
    print("TIMING SUMMARY")
    print(f"{'=' * 70}")
    print(f"  get_key:          {dt_key:.3f}s")
    print(f"  get_megamenu:     {dt_menu:.3f}s")
    print(f"  full pipeline:    {dt_pipeline:.3f}s")

    print(f"\n{'=' * 70}")
    if passed:
        print("COST-003 + COST-004 VALIDATION: PASSED")
    else:
        print("COST-003 + COST-004 VALIDATION: FAILED")
    print(f"{'=' * 70}")

    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    asyncio.run(main())
