import re
import aiohttp

URL = "https://www.costco.com/"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/144.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}


def extract_api_key(html: str) -> str | None:
    match = re.search(r'\\"authentification_token\\":\\"([a-f0-9\-]+)\\"', html)
    return match.group(1) if match else None


async def run_get_key(session: aiohttp.ClientSession) -> str | None:
    async with session.get(URL, headers=HEADERS) as resp:
        resp.raise_for_status()
        html = await resp.text()
    return extract_api_key(html)
