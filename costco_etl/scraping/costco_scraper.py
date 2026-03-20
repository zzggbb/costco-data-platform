import asyncio
import aiohttp

from costco_etl.scraping.get_key import run_get_key
from costco_etl.scraping.get_megamenu import run_get_megamenu
from costco_etl.scraping.parse_megamenu import run_parse_megamenu
from costco_etl.scraping.navigation_crawler import crawl_category
from costco_etl.observability.run_context import RunContext


def _sanitize_unusual_terminators(obj):
    """
    Recursively remove problematic Unicode line separators
    (U+2028 and U+2029) from all string fields.
    """
    if isinstance(obj, dict):
        return {
            k: _sanitize_unusual_terminators(v)
            for k, v in obj.items()
        }

    if isinstance(obj, list):
        return [
            _sanitize_unusual_terminators(v)
            for v in obj
        ]

    if isinstance(obj, str):
        return (
            obj
            .replace("\u2028", " ")
            .replace("\u2029", " ")
        )

    return obj


async def scrape_costco_catalog(ctx: RunContext, demo: bool = False, demo_url: str = "/jewelry.html"):

    timeout = aiohttp.ClientTimeout(total=30, sock_read=15)
    connector = aiohttp.TCPConnector(limit=0)

    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:

        # -------------------------
        # STEP 1 — API KEY
        # -------------------------
        api_key = await run_get_key(session)
        if not api_key:
            raise RuntimeError("API key not found")

        ctx.event(
            "api_key_resolved",
            stage="scrape_catalog",
            level="INFO",
            api_key=api_key,
            demo_mode=demo
        )

        # -------------------------
        # STEP 2 — MEGAMENU
        # -------------------------
        megamenu = await run_get_megamenu(session, api_key)
        if not megamenu:
            raise RuntimeError("Megamenu not found")

        # -------------------------
        # STEP 3 — PARSE MEGAMENU (pure CPU)
        # -------------------------
        parsed = run_parse_megamenu(megamenu)

        if not parsed:
            raise RuntimeError("Parsed megamenu returned empty list")

        ctx.event(
            "megamenu_parsed",
            stage="scrape_catalog",
            level="INFO",
            total_categories=len(parsed),
            demo_mode=demo
        )

        # -------------------------
        # DEMO MODE FILTER
        # -------------------------
        if demo:
            crawl_targets = [c for c in parsed if c.get("url") == demo_url]

            if not crawl_targets:
                raise RuntimeError(f"Demo category {demo_url} not found in megamenu")

            print(f"[DEMO MODE] Crawling only category: {demo_url}")
        else:
            crawl_targets = parsed

        ctx.event(
            "crawl_targets_resolved",
            stage="scrape_catalog",
            level="INFO",
            categories_to_crawl=len(crawl_targets)
        )

        # -------------------------
        # STEP 4 — CONCURRENT CATEGORY FAN-OUT
        # -------------------------
        coros = [
            crawl_category(
                session=session,
                api_key=api_key,
                category_url=category["url"],
                category_count=category["count"],
                ctx=ctx,
                demo=demo,
            )
            for category in crawl_targets
        ]

        results = await asyncio.gather(*coros, return_exceptions=True)

    # ---- Flatten successes, log failures ----
    all_products = []
    failed_categories = 0

    for i, result in enumerate(results):
        if isinstance(result, BaseException):
            failed_categories += 1
            ctx.event(
                "category_crawl_failed",
                level="ERROR",
                stage="scrape_catalog",
                category=crawl_targets[i]["url"],
                error_type=type(result).__name__,
                error=str(result),
            )
            continue

        all_products.extend(result)

    ctx.event(
        "crawl_completed",
        stage="scrape_catalog",
        level="INFO",
        total_products_raw=len(all_products),
        categories_succeeded=len(crawl_targets) - failed_categories,
        categories_failed=failed_categories,
    )

    # -------------------------
    # STEP 5 — DEDUPE
    # -------------------------
    unique = {}
    duplicate_counter = 0

    for p in all_products:
        pid = p.get("id")
        if not pid:
            continue

        if pid not in unique:
            unique[pid] = p
        else:
            existing = unique[pid]
            duplicate_counter += 1

            existing_paths = set(existing.get("categoryPath_ss", []))
            new_paths = set(p.get("categoryPath_ss", []))

            merged_paths = list(existing_paths.union(new_paths))

            existing["categoryPath_ss"] = merged_paths

    deduped_products = list(unique.values())

    raw_count = len(all_products)
    unique_count = len(deduped_products)
    dedupe_ratio = round(unique_count / raw_count, 4) if raw_count else 0

    ctx.event(
        "dedupe_completed",
        stage="scrape_catalog",
        level="INFO",
        total_products_unique=unique_count,
        duplicate_count=duplicate_counter,
        dedupe_ratio=dedupe_ratio
    )

    # -------------------------
    # STEP 6 — SANITIZE
    # -------------------------
    sanitized_products = _sanitize_unusual_terminators(deduped_products)
    return sanitized_products, parsed, {
        "total_raw": raw_count,
        "total_unique": unique_count,
        "duplicates": duplicate_counter
    }
