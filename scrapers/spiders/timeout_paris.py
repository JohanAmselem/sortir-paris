"""
Time Out Paris spider.
Source: https://www.timeout.fr/paris (editorial guide; public structured data JSON-LD).

Strategy:
  1. Candidate detail URLs (/paris/<section>/<slug>) come from
     - section and "best of" list pages (expositions du moment, meilleurs concerts,
       sélection du week-end, calendrier du mois…), and
     - the public XML sitemap (robots.txt lists /paris/sitemap.xml.gz): the two most
       recent sub-sitemaps, URLs in event sections modified in the last
       `sitemap_days` days. Time Out Paris publishes few event reviews (~10–20 a
       month in 2026), so the volume stays modest whatever the crawl depth.
  2. Each detail page: the JSON-LD is a schema.org Review whose `itemReviewed` is the
     event (TheaterEvent/MusicEvent/... with startDate, endDate, Place). Pages that are
     plain articles/lists (no event in JSON-LD) are skipped.
     Title = page <h1> (the JSON-LD name is the editorial headline).
     Price = the first occurrence tile's price (when Time Out shows one), else unknown.
  Category comes from the URL section (art → expos, musique → concerts, …), not from
  the JSON-LD @type (Time Out tags exhibitions as TheaterEvent).
"""

from __future__ import annotations

import json
import re
from typing import Generator, List, Optional
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from utils.event import make_event
from utils.http import BudgetExceeded, PoliteClient, current_budget
from utils.jsonld import EVENT_TYPES, _types, extract_jsonld, image_from, location_from
from utils.normalize import SERVICE_DEPARTMENTS, absolute_url, clean_text, in_service_zone

SOURCE = "timeout"
BASE_URL = "https://www.timeout.fr"

LISTING_PAGES = [
    "/paris/art/les-expositions-du-moment",
    "/paris/art/les-expositions-a-voir-en-ce-moment-a-paris-toutes-les-critiques-de-time-out-paris",
    "/paris/art",
    "/paris/musique",
    "/paris/musique/meilleurs-concerts-paris",
    "/paris/musique/festivals-musique-paris",
    "/paris/theatre",
    "/paris/que-faire-a-paris",
    "/paris/que-faire-a-paris/selection-week-end",
    "/paris/que-faire-a-paris/les-meilleurs-plans-de-la-semaine",
    "/paris/que-faire-a-paris/calendrier-mois",
]
SITEMAPS = [
    "/paris/sitemap_0.xml.gz",
    "/paris/sitemap_1.xml.gz",
]
BUDGET_MARGIN = 30

SECTION_CATEGORY = {
    "art": "expos",
    "musique": "concerts",
    "nightlife": "concerts",
    "theatre": "theatre",
    "danse": "danse",
    "cinema": "cinema",
    "enfants": None,
    "que-faire-a-paris": None,
}

_DETAIL_RE = re.compile(r"^/paris/([a-z-]+)/([a-z0-9-]+)/?$")
_SITEMAP_URL_RE = re.compile(
    r"<loc>\s*(https://www\.timeout\.fr/paris/[^<\s]+)\s*</loc>\s*(?:<lastmod>\s*([0-9-]{10})[^<]*</lastmod>)?"
)


# ─────────────────────────── pure parsers ───────────────────────────

def parse_listing(html: str) -> List[str]:
    """Candidate event detail URLs in event-ish sections."""
    soup = BeautifulSoup(html or "", "html.parser")
    out: List[str] = []
    for a in soup.find_all("a", href=True):
        url = absolute_url(BASE_URL, a["href"])
        if not url:
            continue
        p = urlparse(url)
        if p.netloc != "www.timeout.fr":
            continue
        m = _DETAIL_RE.match(p.path)
        if not m or m.group(1) not in SECTION_CATEGORY:
            continue
        url = f"{BASE_URL}{p.path.rstrip('/')}"
        if url not in out:
            out.append(url)
    return out


def parse_sitemap(xml: str, since=None) -> List[str]:
    """Event-section detail URLs of a sitemap (lastmod ≥ `since` when given)."""
    out: List[str] = []
    for url, lastmod in _SITEMAP_URL_RE.findall(xml or ""):
        p = urlparse(url)
        m = _DETAIL_RE.match(p.path)
        if not m or m.group(1) not in SECTION_CATEGORY:
            continue
        if since is not None and lastmod and lastmod < since.isoformat():
            continue
        u = f"{BASE_URL}{p.path.rstrip('/')}"
        if u not in out:
            out.append(u)
    return out


def _find_event_obj(objs: List[dict]) -> Optional[dict]:
    for o in objs:
        if any(t in EVENT_TYPES for t in _types(o)) and o.get("startDate"):
            return o
        rev = o.get("itemReviewed")
        if isinstance(rev, dict) and any(t in EVENT_TYPES for t in _types(rev)) and rev.get("startDate"):
            return rev
    return None


def _first_occurrence_price(soup) -> Optional[str]:
    tile = soup.find(attrs={"data-testid": "tile-event-occurences_testID"})
    if not tile:
        return None
    el = tile.find(class_=re.compile(r"_price_"))
    txt = clean_text(el.get_text(" ", strip=True)) if el else None
    return txt or None


def parse_detail(html: str, url: str, category_slug: Optional[str] = None) -> List[dict]:
    soup = BeautifulSoup(html or "", "html.parser")
    obj = _find_event_obj(extract_jsonld(soup))
    if obj is None:
        return []  # article / list page, not an event

    h1 = soup.find("h1")
    title = clean_text(h1.get_text(" ", strip=True)) if h1 else None
    title = title or clean_text(obj.get("name"))
    if not title:
        return []

    loc = location_from(obj.get("location"))
    zip_code = loc.get("venue_zip")
    if not loc.get("venue_name"):
        return []
    # Paris + petite couronne (75, 92, 93, 94): postcode first, else coordinates.
    if zip_code and re.fullmatch(r"\d{5}", str(zip_code)):
        if str(zip_code)[:2] not in SERVICE_DEPARTMENTS:
            return []
    elif loc.get("venue_lat") is not None and loc.get("venue_lng") is not None:
        if not in_service_zone(loc["venue_lat"], loc["venue_lng"]):
            return []
    else:
        return []

    if category_slug is None:
        m = _DETAIL_RE.match(urlparse(url).path)
        category_slug = SECTION_CATEGORY.get(m.group(1)) if m else None

    og_desc = soup.find("meta", attrs={"property": "og:description"})
    desc = og_desc.get("content") if og_desc else obj.get("description")
    image = image_from(obj.get("image"))
    if not image:
        og_img = soup.find("meta", attrs={"property": "og:image"})
        image = og_img.get("content") if og_img else None

    price_text = _first_occurrence_price(soup)
    status = str(obj.get("eventStatus") or "").lower()

    return [make_event(
        source=SOURCE,
        source_id=url,  # stable: running shows/expos keep the same id while startDate moves
        title=title,
        start=obj.get("startDate"),
        end=obj.get("endDate"),
        description=desc,
        image_url=absolute_url(url, image) if image else None,
        price_raw=price_text,
        source_url=url,
        booking_url=url,
        venue_name=loc["venue_name"],
        venue_address=loc["venue_address"],
        venue_city=loc["venue_city"],
        venue_zip=zip_code,
        venue_lat=loc["venue_lat"],
        venue_lng=loc["venue_lng"],
        category_slug=category_slug,
        event_status="cancelled" if "cancel" in status else "scheduled",
    )]


# ─────────────────────────── network ───────────────────────────

def _sitemap_text(client, url: str) -> Optional[str]:
    """Sitemap body; the .gz files are served either gzipped or already decoded."""
    import gzip

    try:
        resp = client.get(url)
    except BudgetExceeded:
        raise
    except Exception as e:
        print(f"  [{SOURCE}] sitemap {url} failed: {e}")
        return None
    if resp.status_code != 200:
        print(f"  [{SOURCE}] sitemap {url} → HTTP {resp.status_code}")
        return None
    body = resp.content
    if body[:2] == b"\x1f\x8b":
        try:
            body = gzip.decompress(body)
        except OSError:
            return None
    return body.decode("utf-8", "replace")


def fetch_events(max_pages: int = 3, max_details: int = 400, sitemap_days: int = 240) -> Generator[dict, None, None]:
    """max_pages: kept for run.py compatibility (sections are not paginated).
    Candidates from list pages first, then from the sitemaps; detail pages are
    opened while the time budget allows (max_details as a hard cap)."""
    from datetime import timedelta

    from utils.dates import now_paris

    urls: List[str] = []
    skipped = errors = count = opened = 0
    since = now_paris().date() - timedelta(days=sitemap_days) if sitemap_days else None
    with PoliteClient() as client:
        for path in LISTING_PAGES:
            html = client.get_text(BASE_URL + path)
            if html is None:
                continue
            for u in parse_listing(html):
                if u not in urls and u.rstrip("/") not in (BASE_URL + p for p in LISTING_PAGES):
                    urls.append(u)
        n_list = len(urls)
        for sm in SITEMAPS:
            xml = _sitemap_text(client, BASE_URL + sm)
            for u in parse_sitemap(xml, since):
                if u not in urls and u not in (BASE_URL + p for p in LISTING_PAGES):
                    urls.append(u)
        if not urls:
            print(f"  [{SOURCE}] no candidate URLs (site changed or blocked) — nothing to do")
            return
        print(f"  [{SOURCE}] {len(urls)} candidate pages ({n_list} from list pages), fetching up to {max_details}")
        for url in urls[:max_details]:
            if current_budget().remaining() < BUDGET_MARGIN:
                print(f"  [{SOURCE}] time budget nearly spent — stopping after {opened} pages")
                break
            opened += 1
            try:
                html = client.get_text(url)
                if html is None:
                    errors += 1
                    continue
                events = parse_detail(html, url)
            except BudgetExceeded:
                raise
            except Exception as e:
                errors += 1
                print(f"  [{SOURCE}] parse error {url}: {e}")
                continue
            if not events:
                skipped += 1
            for ev in events:
                count += 1
                yield ev
    print(f"  [{SOURCE}] {count} events, {skipped} non-event / out-of-zone pages skipped, {errors} errors")


if __name__ == "__main__":
    for ev in fetch_events(max_pages=1, max_details=5):
        print(json.dumps(ev, ensure_ascii=False, indent=1))
