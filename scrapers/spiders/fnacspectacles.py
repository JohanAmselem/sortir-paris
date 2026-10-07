"""
FNAC Spectacles spider — concerts, theatre, humour, dance in Paris.
Source: https://www.fnacspectacles.com

Legal basis: public structured data (schema.org JSON-LD) only — no HTML card scraping.

Status (2026-10-07): the site does not answer our honest bot User-Agent (every request,
robots.txt included, times out after 40 s) → fetch_events logs "blocked" and yields
nothing. The parser is kept ready: it reads schema.org Event objects from listing pages
(and from event detail pages linked from them), with an explicit category per listing
URL, and every date goes through make_event/normalize_when (naive = Paris local).
"""

from __future__ import annotations

import re
from typing import Generator, List, Optional

import httpx

from utils.http import BudgetExceeded, PoliteClient
from utils.jsonld import events_from_html
from utils.normalize import absolute_url

SOURCE = "fnacspectacles"
BASE_URL = "https://www.fnacspectacles.com"

# listing URL → explicit category for everything listed there
CATEGORY_URLS = [
    (f"{BASE_URL}/recherche/concerts/?lieu=paris", "concerts"),
    (f"{BASE_URL}/recherche/theatre/?lieu=paris", "theatre"),
    (f"{BASE_URL}/recherche/one-man-show-humour/?lieu=paris", "spectacles"),
    (f"{BASE_URL}/recherche/danse-ballet-opera/?lieu=paris", "danse"),
    (f"{BASE_URL}/recherche/spectacle-enfant/?lieu=paris", "spectacles"),
    (f"{BASE_URL}/recherche/festival/?lieu=paris", "festivals"),
]

# Event detail pages (unverified live: site unreachable from our bot).
_DETAIL_RE = re.compile(r'href="((?:https://www\.fnacspectacles\.com)?/event/[^"?#]+)"')


def parse_listing(html: str, category_slug: Optional[str], base_url: str = BASE_URL) -> List[dict]:
    """schema.org Events embedded in a listing page."""
    return events_from_html(html, source=SOURCE, base_url=base_url, category_slug=category_slug)


def parse_detail_links(html: str, base_url: str = BASE_URL) -> List[str]:
    out: List[str] = []
    for href in _DETAIL_RE.findall(html or ""):
        u = absolute_url(base_url, href)
        if u and u not in out:
            out.append(u)
    return out


def parse_detail(html: str, url: str, category_slug: Optional[str]) -> List[dict]:
    return events_from_html(html, source=SOURCE, base_url=url, category_slug=category_slug)


def fetch_events(max_pages_per_cat: int = 5, max_details: int = 200) -> Generator[dict, None, None]:
    seen: set = set()
    details_done = 0
    with PoliteClient(retries=1, timeout=25) as client:
        for listing_url, category in CATEGORY_URLS:
            for page in range(1, max_pages_per_cat + 1):
                url = listing_url if page == 1 else f"{listing_url}&page={page}"
                try:
                    resp = client.get(url)
                except BudgetExceeded:
                    raise
                except (httpx.TransportError, httpx.TimeoutException) as e:
                    print(f"  [{SOURCE}] blocked: {type(e).__name__} on {url} — site does not answer our bot")
                    return
                if resp.status_code in (403, 429) or resp.status_code >= 500:
                    print(f"  [{SOURCE}] blocked: HTTP {resp.status_code} on {url}")
                    return
                if resp.status_code != 200:
                    break
                html = resp.text
                found = 0
                for ev in parse_listing(html, category):
                    key = (ev["source_id"], ev["start_date"])
                    if key not in seen:
                        seen.add(key)
                        found += 1
                        yield ev
                links = parse_detail_links(html)
                for link in links:
                    if link in seen or details_done >= max_details:
                        continue
                    seen.add(link)
                    details_done += 1
                    try:
                        detail = client.get_text(link)
                        for ev in parse_detail(detail or "", link, category):
                            key = (ev["source_id"], ev["start_date"])
                            if key not in seen:
                                seen.add(key)
                                found += 1
                                yield ev
                    except BudgetExceeded:
                        raise
                    except Exception as e:
                        print(f"  [{SOURCE}] error on {link}: {e}")
                print(f"  [{SOURCE}] {category} page {page}: {found} events")
                if not found and not links:
                    break
