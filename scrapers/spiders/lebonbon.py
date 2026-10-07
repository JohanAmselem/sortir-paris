"""
Le Bonbon Paris spider.
Source: https://www.lebonbon.fr/paris/sorties/ (editorial media).

Status (checked 2026-10-07): Le Bonbon publishes editorial ARTICLES only. Listing
and article pages carry NewsArticle JSON-LD; the Next.js payload has posts with a
publish date (`posts_display_date`) and an empty `places` list — there is no event
date, no venue, no agenda structure. The previous spider stored articles as events
(publish date as start date, no venue) → removed.

This spider now only accepts real agenda items: schema.org Event JSON-LD that has
BOTH a start date and a physical venue. When none is found it logs one line and
yields nothing. All URLs go through absolute_url (urljoin).
"""

from __future__ import annotations

import json
from typing import Generator, List

from utils.http import PoliteClient
from utils.jsonld import events_from_html

SOURCE = "lebonbon"
BASE_URL = "https://www.lebonbon.fr"
LISTING_PATHS = ["/paris/sorties/"]


def parse_page(html: str, url: str = BASE_URL + "/paris/sorties/") -> List[dict]:
    """Agenda events in a page: JSON-LD Event with a start date AND a venue. Articles → []."""
    out = []
    for ev in events_from_html(html or "", source=SOURCE, base_url=url):
        if not ev.get("start_date") or not ev.get("venue_name") or ev.get("is_online"):
            continue
        out.append(ev)
    return out


def fetch_events(max_pages: int = 10) -> Generator[dict, None, None]:
    count = 0
    with PoliteClient() as client:
        for path in LISTING_PATHS:
            for page in range(1, max_pages + 1):
                url = BASE_URL + path + (f"?page={page}" if page > 1 else "")
                html = client.get_text(url)
                if html is None:
                    break
                events = parse_page(html, url)
                if not events:
                    break  # no agenda structure on this page → stop paging
                for ev in events:
                    count += 1
                    yield ev
    if count == 0:
        print(f"  [{SOURCE}] no agenda structure (editorial articles only, no Event JSON-LD "
              f"with date+venue) — yielding nothing")


if __name__ == "__main__":
    for ev in fetch_events(max_pages=1):
        print(json.dumps(ev, ensure_ascii=False, indent=1))
