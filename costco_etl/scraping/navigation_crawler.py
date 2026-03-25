import asyncio
import aiohttp
from costco_etl.observability.run_context import RunContext

BASE_URL = "https://search.costco.com/api/apps/www_costco_com/query/www_costco_com_navigation"

ROWS_PER_PAGE = 24

def _build_headers(api_key: str) -> dict:
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/144.0.0.0 Safari/537.36"
        ),
        "Origin": "https://www.costco.com",
        "Referer": "https://www.costco.com/",
        "x-api-key": api_key,
    }


def _build_params(category_url: str, start: int) -> dict:
    return {
        "expoption": "lw",
        "q": "*:*",
        "locale": "en-US",
        "start": start,
        "expand": "false",
        "userLocation": "WA",
        "loc": "115-bd,1-wh,1250-3pl,1321-wm,1456-3pl,283-wm,561-wm,725-wm,731-wm,758-wm,759-wm,"
               "847_0-cor,847_0-cwt,847_0-edi,847_0-ehs,847_0-membership,847_0-mpt,847_0-spc,"
               "847_0-wm,847_1-cwt,847_1-edi,847_d-fis,847_lg_n1f-edi,847_lux_us01-edi,"
               "847_NA-cor,847_NA-pharmacy,847_NA-wm,847_ss_u362-edi,847_wp_r458-edi,"
               "951-wm,952-wm,9847-wcs",
        "whloc": "1-wh",
        "rows": ROWS_PER_PAGE,
        "url": category_url,
        "fq": '{!tag=item_program_eligibility}item_program_eligibility:("ShipIt")',
        "chdcategory": "true",
        "chdheader": "true",
    }


async def _fetch_page(
    session: aiohttp.ClientSession,
    headers: dict,
    category_url: str,
    start: int,
) -> list:
    params = _build_params(category_url, start=start)
    async with session.get(BASE_URL, headers=headers, params=params) as resp:
        resp.raise_for_status()
        data = await resp.json()
    return data.get("response", {}).get("docs", [])


async def crawl_category(
    session: aiohttp.ClientSession,
    api_key: str,
    category_url: str,
    category_count: int,
    ctx: RunContext,
    demo: bool = False,
    max_demo_pages: int = 3,
) -> list:

    headers = _build_headers(api_key)

    # ---- Probe: first page (sequential — we need numFound) ----
    params = _build_params(category_url, start=0)
    async with session.get(BASE_URL, headers=headers, params=params) as resp:
        resp.raise_for_status()
        data = await resp.json()

    response_block = data.get("response", {})
    docs = response_block.get("docs", [])
    num_found = response_block.get("numFound", 0)
    total_pages = -(-num_found // ROWS_PER_PAGE)  # ceiling division

    if not docs:
        return []

    ctx.event(
        "crawl_page_fetched",
        stage="scrape_catalog",
        category=category_url,
        page=1,
        total_pages=total_pages,
    )

    # ---- Fan-out: all remaining pages concurrently ----
    offsets = list(range(ROWS_PER_PAGE, num_found, ROWS_PER_PAGE))

    if demo:
        max_remaining = max_demo_pages - 1  # page 1 already fetched
        offsets = offsets[:max_remaining]

        if len(offsets) < total_pages - 1:
            ctx.event(
                "demo_pagination_stopped",
                stage="scrape_catalog",
                category=category_url,
                stopped_at_page=len(offsets) + 1,
                total_available_pages=total_pages,
                max_demo_pages=max_demo_pages,
            )

    # ---------- VÁLVULA DE PAGINACIÓN INTERNA ----------
    page_sem = asyncio.Semaphore(3)  # Máximo 3 páginas simultáneas por categoría

    async def _bound_fetch_page(start_offset):
        async with page_sem:
            await asyncio.sleep(0.5)  # Micro-pausa entre páginas
            return await _fetch_page(session, headers, category_url, start_offset)

    tasks = [
        _bound_fetch_page(start)
        for start in offsets
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)
    # ---------------------------------------------------

    all_docs = list(docs)  # page 1 docs

    for i, result in enumerate(results):
        if isinstance(result, BaseException):
            ctx.event(
                "crawl_page_failed",
                level="ERROR",
                stage="scrape_catalog",
                category=category_url,
                page=i + 2,
                error=str(result),
            )
            continue

        all_docs.extend(result)

        ctx.event(
            "crawl_page_fetched",
            stage="scrape_catalog",
            category=category_url,
            page=i + 2,
            total_pages=total_pages,
        )

    return all_docs
