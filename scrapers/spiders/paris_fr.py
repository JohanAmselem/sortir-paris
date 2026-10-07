"""
Paris.fr spider — https://www.paris.fr/quefaire (www.paris.fr/evenements redirects there).

DUPLICATE SOURCE — recommended to keep DISABLED: paris.fr/quefaire is the front-end of
the "Que faire à Paris" database, which the paris_opendata spider already ingests in
full through the official open-data API (the number at the end of every
paris.fr/evenements/...-<id> URL is the dataset record `id`). This module is kept
fail-safe and bounded for spot checks only.

Legal basis: public structured data (schema.org JSON-LD Event on every event page).
Listing page → event URLs; event page → JSON-LD (name, start/end, place, address,
offers.url). The JSON-LD has no price and encodes "no time" as 00:00.
"""

from __future__ import annotations

import re
from typing import Generator, List, Optional

from bs4 import BeautifulSoup

from utils.http import BudgetExceeded, PoliteClient
from utils.jsonld import events_from_html
from utils.normalize import absolute_url

SOURCE = "paris_fr"
BASE_URL = "https://www.paris.fr"
LISTING_URL = f"{BASE_URL}/quefaire"

_EVENT_PATH_RE = re.compile(r"^/evenements/[a-z0-9-]+-(\d+)/?$")


def parse_listing(html: str, base_url: str = LISTING_URL) -> List[str]:
    """Unique event URLs (https://www.paris.fr/evenements/<slug>-<id>) in page order."""
    soup = BeautifulSoup(html or "", "html.parser")
    out, seen = [], set()
    for a in soup.find_all("a", href=True):
        url = absolute_url(base_url, a["href"])
        if not url or not url.startswith(BASE_URL):
            continue
        path = url[len(BASE_URL):].split("?")[0].split("#")[0]
        if not _EVENT_PATH_RE.match(path):
            continue
        url = BASE_URL + path
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


def record_id(url: str) -> Optional[str]:
    m = _EVENT_PATH_RE.match(url.replace(BASE_URL, "").split("?")[0])
    return m.group(1) if m else None


def parse_detail(html: str, url: str) -> List[dict]:
    """Event page → event dicts from its JSON-LD (00:00 = time unknown)."""
    return events_from_html(
        html, source=SOURCE, base_url=url, source_id=record_id(url), midnight_unknown=True,
    )


def fetch_events(max_pages: int = 1, max_events: int = 30) -> Generator[dict, None, None]:
    """Bounded: 1 listing request + up to `max_events` event pages.

    `max_pages` is kept for run.py compatibility; the listing has no stable pagination.
    """
    with PoliteClient() as client:
        html = client.get_text(LISTING_URL)
        if html is None:
            print("  [paris_fr] listing unavailable — nothing fetched")
            return
        urls = parse_listing(html)[:max_events]
        if not urls:
            print("  [paris_fr] no event links found on listing (structure changed?)")
            return
        for url in urls:
            try:
                page = client.get_text(url)
                if page is None:
                    continue
                for ev in parse_detail(page, url):
                    yield ev
            except BudgetExceeded:
                raise
            except Exception as e:
                print(f"  [paris_fr] skip {url}: {type(e).__name__}: {e}")


if __name__ == "__main__":
    import json

    for ev in fetch_events(max_events=3):
        print(json.dumps(ev, ensure_ascii=False, indent=2))
