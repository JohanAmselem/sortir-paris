"""
SortirAParis spider.
Source: https://www.sortiraparis.com (editorial events guide, HTML scraping).

Strategy:
  1. Category listing pages (/<category>/page/N) → article URLs of that category,
     plus the editorial "guides" linked from page 1 ("les belles expositions à voir
     en ce moment", "que faire ce week-end", "sorties gratuites d'octobre"…), which
     list 50–170 CURRENT articles each. Guide articles are opened first, then the
     category articles page by page (round-robin across categories), until the time
     budget is nearly spent. robots.txt only disallows /ajax/ and /nl-out.
  2. Each article page carries schema.org/Event *microdata* (no JSON-LD Event —
     the JSON-LD is a NewsArticle) with an "Informations pratiques" block:
       - "Dates et Horaires" (visible text, e.g. "Du 6 octobre 2026 au 31 janvier 2027",
         "Le 15 octobre 2026 à 20h"),
       - "Lieu" (schema.org Place microdata: name, streetAddress, postalCode, locality),
       - "Tarifs" (free text),
       - map markers with lat/lng.
  Articles without a real date in "Dates et Horaires" (venue guides showing
  "Prochains jours", news) are skipped: we never default to today.
"""

from __future__ import annotations

import json
import re
from datetime import date
from typing import Generator, List, Optional

from bs4 import BeautifulSoup

from utils.dates import parse_date_fr
from utils.event import make_event
from utils.http import BudgetExceeded, PoliteClient, current_budget
from utils.jsonld import extract_jsonld
from utils.normalize import (
    SERVICE_DEPARTMENTS,
    absolute_url,
    clean_text,
    extract_zip,
    in_service_zone,
    parse_price_fr,
)

SOURCE = "sortiraparis"
BASE_URL = "https://www.sortiraparis.com"

# (listing path, category slug or None → detect_category)
LISTING_PAGES = [
    ("/arts-culture/exposition", "expos"),
    ("/scenes/concert-musique", "concerts"),
    ("/scenes/theatre", "theatre"),
    ("/scenes/spectacle", "spectacles"),
    ("/loisirs/salon", None),
    ("/bons-plans/sorties-gratuites", None),
]

# Section prefix of an article URL → category (articles reached through guides).
SECTION_CATEGORY = {path: cat for path, cat in LISTING_PAGES}

# Sections whose articles can be events (guides also link to restaurants, hotels,
# trips outside Île-de-France…, which are never opened).
EVENT_SECTIONS = (
    "/arts-culture/", "/scenes/", "/loisirs/salon", "/loisirs/insolite", "/loisirs/cinema",
    "/bons-plans/", "/actualites/",
)

# Stop opening articles when less than this many seconds of budget remain.
BUDGET_MARGIN = 30

_ARTICLE_RE = re.compile(r"/articles/(\d+)-")
# "Éphéméride du 5 octobre à Paris : …" = history anecdotes tagged with today's date
_NOT_EVENT_RE = re.compile(r"ephemeride|éphéméride|ephéméride", re.I)
_GUIDE_RE = re.compile(r"/guides/(\d+)-")
# Guides worth following: current-programme lists, not restaurant / shopping guides.
_GUIDE_TOPIC_RE = re.compile(
    r"(a-voir|que-faire|week-end|sorties|programme|agenda|ne-pas-manquer|prochains-concerts|"
    r"expositions|concerts|spectacles|theatre|pieces|festival)"
)


# ─────────────────────────── pure parsers ───────────────────────────

def parse_listing(html: str, listing_path: str = "") -> List[str]:
    """Article URLs from a category listing page (same category only, no guides)."""
    soup = BeautifulSoup(html or "", "html.parser")
    urls: List[str] = []
    seen = set()
    prefix = listing_path.rstrip("/") + "/articles/" if listing_path else "/articles/"
    for a in soup.find_all("a", href=True):
        url = absolute_url(BASE_URL, a["href"])
        if not url or not url.startswith(BASE_URL):
            continue
        path = url[len(BASE_URL):].split("?")[0].split("#")[0]
        if prefix not in path or not _ARTICLE_RE.search(path):
            continue
        url = BASE_URL + path
        if url not in seen:
            seen.add(url)
            urls.append(url)
    return urls


def _section_of(path: str) -> Optional[str]:
    for prefix in SECTION_CATEGORY:
        if path.startswith(prefix + "/"):
            return prefix
    return None


def parse_links(html: str):
    """(event-section article URLs, current-programme guide URLs) linked from any page."""
    soup = BeautifulSoup(html or "", "html.parser")
    articles: List[str] = []
    guides: List[str] = []
    for a in soup.find_all("a", href=True):
        url = absolute_url(BASE_URL, a["href"])
        if not url or not url.startswith(BASE_URL + "/"):
            continue
        path = url[len(BASE_URL):].split("?")[0].split("#")[0]
        if not path.startswith(EVENT_SECTIONS):
            continue
        url = BASE_URL + path
        if _ARTICLE_RE.search(path):
            if url not in articles and not _NOT_EVENT_RE.search(path):
                articles.append(url)
        elif _GUIDE_RE.search(path) and _GUIDE_TOPIC_RE.search(path) and url not in guides:
            guides.append(url)
    return articles, guides


def category_for_url(url: str) -> Optional[str]:
    path = url[len(BASE_URL):] if url.startswith(BASE_URL) else url
    sec = _section_of(path)
    return SECTION_CATEGORY.get(sec) if sec else None


def _block_text(practical, label: str) -> Optional[str]:
    """Text of the <p> whose <strong> title starts with `label` (title removed)."""
    for strong in practical.find_all("strong"):
        if clean_text(strong.get_text() or "").lower().startswith(label.lower()):
            p = strong.find_parent("p")
            if p is None:
                continue
            parts = []
            for node in p.children:
                if node is strong:
                    continue
                txt = node.get_text(" ", strip=True) if hasattr(node, "get_text") else str(node)
                if txt and txt.strip():
                    parts.append(txt.strip())
            return clean_text(" ".join(parts))
    return None


def _prop(scope, name: str) -> Optional[str]:
    el = scope.find(attrs={"itemprop": name}) if scope is not None else None
    if el is None:
        return None
    return clean_text(el.get("content") or el.get_text(" ", strip=True))


def _map_marker(html: str):
    m = re.search(r'"markers"\s*:\s*\[\s*\{\s*"l"\s*:\s*([\d.\-]+)\s*,\s*"L"\s*:\s*([\d.\-]+)', html)
    if not m:
        return None, None
    return float(m.group(1)), float(m.group(2))


def _in_zone_place(zip_code: Optional[str], lat, lng) -> bool:
    """Paris + petite couronne (75, 92, 93, 94): postcode first, else coordinates."""
    if zip_code and re.fullmatch(r"\d{5}", zip_code):
        return zip_code[:2] in SERVICE_DEPARTMENTS
    if lat is not None and lng is not None:
        return in_service_zone(lat, lng)
    return False


def parse_detail(
    html: str,
    url: str,
    category_slug: Optional[str] = None,
    today: Optional[date] = None,
) -> List[dict]:
    """One article page → [event] or [] (no real date / venue outside Paris + petite couronne)."""
    soup = BeautifulSoup(html or "", "html.parser")
    scope = soup.find(attrs={"itemtype": re.compile(r"schema\.org/Event$", re.I)})
    practical = soup.find(id="practical-info")
    if scope is None or practical is None:
        return []

    h1 = soup.find("h1")
    title = clean_text(h1.get_text(" ", strip=True)) if h1 else _prop(scope, "name")
    if not title or _NOT_EVENT_RE.match(title):
        return []

    dates_text = _block_text(practical, "Dates")
    when = parse_date_fr(dates_text, today=today) if dates_text else None
    if when is None or when.start is None:
        return []  # "Prochains jours", "jusqu'au …" only, or no date at all

    place = practical.find(attrs={"itemprop": "location"})
    venue_name = _prop(place, "name")
    street = _prop(place, "streetAddress")
    zip_code = _prop(place, "postalCode") or extract_zip(_block_text(practical, "Lieu"))
    locality = _prop(place, "addressLocality")
    lat, lng = _map_marker(html)
    if not venue_name or not _in_zone_place(zip_code, lat, lng):
        return []
    city = "Paris" if locality and locality.lower().startswith("paris") else locality

    price_text = _block_text(practical, "Tarif")
    price = parse_price_fr(price_text) if price_text else None

    desc = None
    for o in extract_jsonld(soup):
        if "article" in str(o.get("@type") or "").lower() and o.get("description"):
            desc = o["description"]
            break
    if not desc:
        meta = soup.find("meta", attrs={"property": "og:description"}) or soup.find(
            "meta", attrs={"name": "description"})
        desc = meta.get("content") if meta else None
    img = soup.find("meta", attrs={"property": "og:image"})
    image = absolute_url(url, img["content"]) if img and img.get("content") else None

    m = _ARTICLE_RE.search(url)
    source_id = m.group(1) if m else None

    return [make_event(
        source=SOURCE,
        source_id=source_id,
        title=title,
        when=when,
        description=desc,
        image_url=image,
        price=price,
        source_url=url,
        booking_url=url,
        venue_name=venue_name,
        venue_address=street,
        venue_city=city,
        venue_zip=zip_code,
        venue_lat=lat,
        venue_lng=lng,
        category_slug=category_slug,
    )]


# ─────────────────────────── network ───────────────────────────

def _budget_left() -> float:
    return current_budget().remaining()


def _interleave(lists: List[List[str]]) -> List[str]:
    out: List[str] = []
    for i in range(max((len(x) for x in lists), default=0)):
        for x in lists:
            if i < len(x) and x[i] not in out:
                out.append(x[i])
    return out


def fetch_events(max_pages: int = 10, max_details: int = 2000, max_guides: int = 15) -> Generator[dict, None, None]:
    """Category pages (max_pages each) + current guides (max_guides) → article pages,
    guide articles first, while the time budget allows (max_details as a hard cap)."""
    by_cat: dict = {path: [] for path, _ in LISTING_PAGES}
    guides: List[str] = []
    guide_articles: List[List[str]] = []
    skipped = errors = opened = count = 0
    with PoliteClient() as client:
        for page in range(1, max_pages + 1):
            for path, _cat in LISTING_PAGES:
                if page > 1 and not by_cat[path]:
                    continue  # page 1 failed
                url = f"{BASE_URL}{path}" + (f"/page/{page}" if page > 1 else "")
                html = client.get_text(url)
                if html is None:
                    if page == 1:
                        print(f"  [{SOURCE}] listing unavailable or blocked: {url}")
                    continue
                by_cat[path].append(parse_listing(html, path))
                if page == 1:
                    guides += [g for g in parse_links(html)[1] if g not in guides]
        for g in guides[:max_guides]:
            html = client.get_text(g)
            if html is not None:
                guide_articles.append(parse_links(html)[0])
        jobs = _interleave(guide_articles)
        listed = _interleave([[u for pg in by_cat[p] for u in pg] for p in by_cat])
        jobs += [u for u in listed if u not in jobs]
        print(f"  [{SOURCE}] {len(jobs)} article URLs ({len(guides[:max_guides])} guides), "
              f"opening up to {max_details} while the budget allows")

        for url in jobs[:max_details]:
            if _budget_left() < BUDGET_MARGIN:
                print(f"  [{SOURCE}] time budget nearly spent — stopping after {opened} articles")
                break
            opened += 1
            try:
                html = client.get_text(url)
                if html is None:
                    errors += 1
                    continue
                events = parse_detail(html, url, category_slug=category_for_url(url))
            except BudgetExceeded:
                raise
            except Exception as e:  # one bad page never kills the run
                errors += 1
                print(f"  [{SOURCE}] parse error {url}: {e}")
                continue
            if not events:
                skipped += 1
            for ev in events:
                count += 1
                yield ev
    print(f"  [{SOURCE}] {count} events from {opened} articles, {skipped} without real date/venue "
          f"in zone skipped, {errors} errors")


if __name__ == "__main__":
    for i, ev in enumerate(fetch_events(max_pages=1, max_details=5)):
        print(json.dumps(ev, ensure_ascii=False, indent=1))
