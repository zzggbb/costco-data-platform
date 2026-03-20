import aiohttp

MEGAMENU_URL = (
    "https://search.costco.com/api/apps/www_costco_com/query/"
    "www_costco_com_megamenu"
)


async def run_get_megamenu(session: aiohttp.ClientSession, api_key: str) -> dict:
    if not api_key:
        raise ValueError("api_key is required")

    headers = {
        "Host": "search.costco.com",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0"
        ),
        "Accept": "*/*",
        "Origin": "https://www.costco.com",
        "Referer": "https://www.costco.com/",
        "Accept-Language": "en-US,en;q=0.9",
        "x-api-key": api_key,
    }

    params = {
        "locale": "en-US",
        "bypasslocation": "1",
        "chdmegamenu": "true",
    }

    async with session.get(MEGAMENU_URL, headers=headers, params=params) as resp:
        resp.raise_for_status()
        return await resp.json()
