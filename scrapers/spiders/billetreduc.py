"""
BilletReduc spider — theatre, humour and concerts in Paris.
Source: https://www.billetreduc.com

Legal basis: public structured data (schema.org JSON-LD). robots.txt only disallows
search, account, /api/ and "?…Lpg=" pagination parameters — "?page=N" is allowed.

- Listing pages carry an ItemList JSON-LD with the 20 show URLs of the page
  (?page=N for the next ones; the last page number is in the pagination links).
  Paris universes (2026-10-09): théâtre 57 pages, humour 37, concerts 36,
  spectacles 16, jeune public 16, expos 9, visites 8, comedy clubs 6, danse 5,
  opéra 2; petite couronne: /hauts-de-seine/…, /seine-saint-denis/…, /val-de-marne/….
  That is ~4,000 shows: far more than one run can open at 1 req/s, so the listings
  are read round-robin (page 1 of every listing, then page 2, …) and show pages are
  opened until the time budget is nearly spent — the most popular shows of every
  universe come first.
- Each show page carries one schema.org Event: startDate = next performance (with
  time and offset), endDate = last performance, Place + PostalAddress, AggregateOffer
  lowPrice/highPrice in euros.

Note: the JSON-LD <script> type is HTML-escaped ("application/ld&#x2B;json");
BeautifulSoup decodes it, so utils.jsonld handles it.
"""

from __future__ import annotations

import re
from typing import Generator, List, Optional

from utils.http import BudgetExceeded, PoliteClient, current_budget
from utils.jsonld import events_from_html, extract_jsonld
from utils.normalize import SERVICE_DEPARTMENTS, absolute_url

SOURCE = "billetreduc"
BASE_URL = "https://www.billetreduc.com"

# (listing path, explicit category for the shows listed there). A show listed in
# several universes keeps the category of the first listing it was seen in.
LISTINGS = [
    ("/theatre", "theatre"),
    ("/humour", "spectacles"),
    ("/concerts", "concerts"),
    ("/spectacles", "spectacles"),
    ("/spectacles-enfants", "spectacles"),
    ("/danse-et-ballet", "danse"),
    ("/opera", "concerts"),
    ("/musees-et-expos", "expos"),
    ("/visites-guidees", "visites"),
    ("/comedy-clubs", "spectacles"),
]
SUBURBS = ("hauts-de-seine", "seine-saint-denis", "val-de-marne")
SUBURB_UNIVERSES = [
    ("theatre", "theatre"),
    ("humour", "spectacles"),
    ("concerts", "concerts"),
    ("spectacles-enfants", "spectacles"),
]
LISTINGS += [(f"/{dept}/{path}", cat) for dept in SUBURBS for path, cat in SUBURB_UNIVERSES]

# Stop opening show pages when less than this many seconds of budget remain.
BUDGET_MARGIN = 30
_PAGE_RE = re.compile(r'\?page=(\d+)"')

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


def last_page(html: str) -> int:
    """Highest ?page=N in the pagination links (1 when the listing has one page)."""
    pages = [int(x) for x in _PAGE_RE.findall(html or "")]
    return max(pages) if pages else 1


def in_zone(ev: dict) -> bool:
    """Paris + petite couronne (75, 92, 93, 94). Unknown postcode → kept (validation decides)."""
    z = (ev.get("venue_zip") or "").strip()
    return not (len(z) == 5 and z.isdigit()) or z[:2] in SERVICE_DEPARTMENTS


def parse_detail(html: str, url: str, category_slug: Optional[str] = None) -> List[dict]:
    """Show page → event dicts (one per schema.org Event; usually one), zone-filtered."""
    out = []
    sid = show_id(url)
    for ev in events_from_html(html, source=SOURCE, base_url=url, category_slug=category_slug):
        if not in_zone(ev):
            continue
        if sid:
            # Stable id per show: startDate is "next performance" and moves every run.
            ev["source_id"] = f"billetreduc-{sid}"
        out.append(ev)
    return out


def _budget_left() -> float:
    return current_budget().remaining()


def fetch_events(max_pages_per_cat: int = 100, max_shows: int = 5000) -> Generator[dict, None, None]:
    """Listings are read proportionally to their size: page 1 of every listing first,
    then always the listing with the smallest share of its pages read. Every new show
    page is opened while the time budget allows (see module docstring)."""
    seen: set = set()
    errors = shows = count = skipped = 0
    category = dict(LISTINGS)
    last = {path: 1 for path, _ in LISTINGS}  # from the page-1 pagination links
    done = {path: 0 for path, _ in LISTINGS}
    alive = [path for path, _ in LISTINGS]
    with PoliteClient() as client:
        while alive:
            if _budget_left() < BUDGET_MARGIN or shows >= max_shows:
                print(f"  [{SOURCE}] stopping: time budget nearly spent or max_shows reached")
                break
            path = min(alive, key=lambda p: (done[p] / last[p], alive.index(p)))
            page = done[path] + 1
            if page > min(last[path], max_pages_per_cat):
                alive.remove(path)
                continue
            done[path] = page
            url = f"{BASE_URL}{path}" + (f"?page={page}" if page > 1 else "")
            html = client.get_text(url)
            if html is None:
                if page == 1 and path == LISTINGS[0][0]:
                    print(f"  [{SOURCE}] blocked: listing {url} unreachable — stopping")
                    return
                alive.remove(path)
                continue
            if page == 1:
                last[path] = last_page(html)
            listed = parse_listing(html)
            if not listed:
                alive.remove(path)
                continue
            show_urls = [u for u in listed if u not in seen]
            n = 0
            for show_url in show_urls:
                if _budget_left() < BUDGET_MARGIN or shows >= max_shows:
                    break
                seen.add(show_url)
                shows += 1
                try:
                    detail = client.get_text(show_url)
                    if detail is None:
                        errors += 1
                        continue
                    evs = parse_detail(detail, show_url, category[path])
                    if not evs:
                        skipped += 1
                    for ev in evs:
                        n += 1
                        count += 1
                        yield ev
                except BudgetExceeded:
                    raise
                except Exception as e:  # one bad page never kills the run
                    errors += 1
                    print(f"  [{SOURCE}] error on {show_url}: {e}")
            print(f"  [{SOURCE}] {path} page {page}/{last[path]}: {n} events from {len(show_urls)} new shows")
    print(f"  [{SOURCE}] {count} events from {shows} show pages "
          f"({skipped} without event or outside the zone, {errors} failed); pages read {done}")
