"""
Mapado spider.
Source: https://www.mapado.com

Legal basis: public structured data (schema.org JSON-LD) only.

Status (2026-10-07): mapado.com no longer publishes a consumer agenda —
https://www.mapado.com/paris and /paris/<category> return HTTP 404 and the home page
is the B2B ticketing/CRM product site (no __NEXT_DATA__ event list, no JSON-LD).
fetch_events therefore logs "no public feed" and yields nothing by default.

The parser stays usable for organiser ticketing pages that embed schema.org Events
(pass them as `listing_urls=[(url, category_slug), ...]`): prices go through
price_from_offers (euros → centimes), dates through make_event (naive = Paris local).
"""

from __future__ import annotations

from typing import Generator, Iterable, List, Optional, Tuple

from utils.http import BudgetExceeded, PoliteClient
from utils.jsonld import events_from_html

SOURCE = "mapado"

# Former public agenda (all 404 since Mapado's pivot to B2B ticketing).
LISTING_URLS: List[Tuple[str, Optional[str]]] = [
    ("https://www.mapado.com/paris/concerts", "concerts"),
    ("https://www.mapado.com/paris/theatre", "theatre"),
    ("https://www.mapado.com/paris/expositions", "expos"),
    ("https://www.mapado.com/paris/danse", "danse"),
]


def parse_page(html: str, url: str, category_slug: Optional[str] = None) -> List[dict]:
    return events_from_html(html, source=SOURCE, base_url=url, category_slug=category_slug)


def fetch_events(
    max_pages_per_cat: int = 5,
    listing_urls: Optional[Iterable[Tuple[str, Optional[str]]]] = None,
) -> Generator[dict, None, None]:
    urls = list(listing_urls or LISTING_URLS)
    seen: set = set()
    with PoliteClient() as client:
        for i, (base, category) in enumerate(urls):
            for page in range(1, max_pages_per_cat + 1):
                url = base if page == 1 else f"{base}{'&' if '?' in base else '?'}page={page}"
                try:
                    resp = client.get(url)
                except BudgetExceeded:
                    raise
                except Exception as e:
                    print(f"  [{SOURCE}] {url} failed: {e}")
                    break
                if resp.status_code != 200:
                    if i == 0 and page == 1 and listing_urls is None:
                        print(f"  [{SOURCE}] no public feed: HTTP {resp.status_code} on {url} "
                              f"(mapado.com has no public Paris agenda any more)")
                        return
                    break
                evs = [e for e in parse_page(resp.text, url, category) if (e["source_id"], e["start_date"]) not in seen]
                for ev in evs:
                    seen.add((ev["source_id"], ev["start_date"]))
                    yield ev
                print(f"  [{SOURCE}] {url}: {len(evs)} events")
                if not evs:
                    break
