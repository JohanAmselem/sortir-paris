"""
BilletReduc spider — theatre, humour and concerts in Paris.
Source: https://www.billetreduc.com

Legal basis: public structured data (schema.org JSON-LD).
- Listing pages (/theatre, /humour, /concerts — Paris) carry an ItemList JSON-LD
  with the 20 show URLs of the page (?page=N for the next ones).
- Each show page carries one schema.org Event: startDate = next performance (with
  time and offset), endDate = last performance, Place + PostalAddress, AggregateOffer
  lowPrice/highPrice in euros.

Note: the JSON-LD <script> type is HTML-escaped ("application/ld&#x2B;json");
BeautifulSoup decodes it, so utils.jsonld handles it.
"""

from __future__ import annotations

import re
from typing import Generator, List, Optional

from utils.http import BudgetExceeded, PoliteClient
from utils.jsonld import events_from_html, extract_jsonld
from utils.normalize import absolute_url

SOURCE = "billetreduc"
BASE_URL = "https://www.billetreduc.com"

# (listing path, explicit category for the shows listed there)
LISTINGS = [
    ("/theatre", "theatre"),
    ("/humour", "spectacles"),
    ("/concerts", "concerts"),
]

_SHOW_RE = re.compile(r"^https?://www\.billetreduc\.com/spectacle/[a-z0-9\-]+-(\d+)/?$")


def show_id(url: str) -> Optional[str]:
    m = _SHOW_RE.match(url or "")
    return m.group(1) if m else None


def parse_listing(html: str, base_url: str = BASE_URL) -> List[str]:
    """Show URLs of a listing page (from its ItemList JSON-LD; anchors as fallback)."""
    urls: List[str] = []
    for obj in extract_jsonld(html):
        if obj.get("@type") != "ItemList":
            continue
        for el in obj.get("itemListElement") or []:
            if isinstance(el, dict):
                item = el.get("item")
                u = el.get("url") or (item.get("url") if isinstance(item, dict) else item)
                u = absolute_url(base_url, u) if isinstance(u, str) else None
                if u and show_id(u) and u not in urls:
                    urls.append(u)
    if urls:
        return urls
    for href in re.findall(r'href="([^"]*/spectacle/[^"?#]+)"', html or ""):
        u = absolute_url(base_url, href)
        if u and show_id(u) and u not in urls:
            urls.append(u)
    return urls


def parse_detail(html: str, url: str, category_slug: Optional[str] = None) -> List[dict]:
    """Show page → event dicts (one per schema.org Event; usually one)."""
    out = []
    sid = show_id(url)
    for ev in events_from_html(html, source=SOURCE, base_url=url, category_slug=category_slug):
        if sid:
            # Stable id per show: startDate is "next performance" and moves every run.
            ev["source_id"] = f"billetreduc-{sid}"
        out.append(ev)
    return out


def fetch_events(max_pages_per_cat: int = 3, max_shows: int = 300) -> Generator[dict, None, None]:
    """Listing pages → show pages (JSON-LD). ~20 shows per listing page."""
    seen: set = set()
    errors = 0
    with PoliteClient() as client:
        for path, category in LISTINGS:
            for page in range(1, max_pages_per_cat + 1):
                url = f"{BASE_URL}{path}" + (f"?page={page}" if page > 1 else "")
                html = client.get_text(url)
                if html is None:
                    if page == 1 and path == LISTINGS[0][0]:
                        print(f"  [{SOURCE}] blocked: listing {url} unreachable — stopping")
                        return
                    break
                show_urls = [u for u in parse_listing(html) if u not in seen]
                if not show_urls:
                    break
                count = 0
                for show_url in show_urls:
                    if len(seen) >= max_shows:
                        print(f"  [{SOURCE}] max_shows={max_shows} reached")
                        return
                    seen.add(show_url)
                    try:
                        detail = client.get_text(show_url)
                        if detail is None:
                            errors += 1
                            continue
                        for ev in parse_detail(detail, show_url, category):
                            count += 1
                            yield ev
                    except BudgetExceeded:
                        raise
                    except Exception as e:  # one bad page never kills the run
                        errors += 1
                        print(f"  [{SOURCE}] error on {show_url}: {e}")
                print(f"  [{SOURCE}] {path} page {page}: {count} events from {len(show_urls)} shows")
    if errors:
        print(f"  [{SOURCE}] {errors} show pages failed")
