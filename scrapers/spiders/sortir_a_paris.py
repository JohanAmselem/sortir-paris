"""
SortirAParis spider.
Source: https://www.sortiraparis.com (editorial events guide, HTML scraping).

Strategy:
  1. Category listing pages (/<category>/page/N) → article URLs of that category.
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
from utils.http import BudgetExceeded, PoliteClient
from utils.jsonld import extract_jsonld
from utils.normalize import absolute_url, clean_text, extract_zip, in_idf, parse_price_fr, IDF_DEPARTMENTS

SOURCE = "sortiraparis"
BASE_URL = "https://www.sortiraparis.com"

# (listing path, category slug or None → detect_category)
LISTING_PAGES = [
    ("/arts-culture/exposition", "expos"),
    ("/scenes/concert-musique", "concerts"),
    ("/scenes/theatre", "theatre"),
    ("/loisirs/salon", None),
    ("/bons-plans/sorties-gratuites", None),
]

_ARTICLE_RE = re.compile(r"/articles/(\d+)-")


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


def _in_idf_place(zip_code: Optional[str], lat, lng) -> bool:
    if lat is not None and lng is not None:
        return in_idf(lat, lng)
    return bool(zip_code) and zip_code[:2] in IDF_DEPARTMENTS


def parse_detail(
    html: str,
    url: str,
    category_slug: Optional[str] = None,
    today: Optional[date] = None,
) -> List[dict]:
    """One article page → [event] or [] (no real date / no IDF venue)."""
    soup = BeautifulSoup(html or "", "html.parser")
    scope = soup.find(attrs={"itemtype": re.compile(r"schema\.org/Event$", re.I)})
    practical = soup.find(id="practical-info")
    if scope is None or practical is None:
        return []

    h1 = soup.find("h1")
    title = clean_text(h1.get_text(" ", strip=True)) if h1 else _prop(scope, "name")
    if not title:
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
    if not venue_name or not _in_idf_place(zip_code, lat, lng):
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

def fetch_events(max_pages: int = 3, max_details: int = 120) -> Generator[dict, None, None]:
    """Listing pages (max_pages per category) → article pages (max_details total)."""
    jobs = []  # (url, category)
    seen = set()
    skipped = errors = 0
    with PoliteClient() as client:
        for path, cat in LISTING_PAGES:
            for page in range(1, max_pages + 1):
                url = f"{BASE_URL}{path}" + (f"/page/{page}" if page > 1 else "")
                html = client.get_text(url)
                if html is None:
                    if page == 1 and not jobs:
                        print(f"  [{SOURCE}] listing unavailable: {url}")
                    break
                found = [u for u in parse_listing(html, path) if u not in seen]
                if not found:
                    break
                for u in found:
                    seen.add(u)
                    jobs.append((u, cat))
        print(f"  [{SOURCE}] {len(jobs)} article URLs, fetching up to {max_details}")

        count = 0
        for url, cat in jobs[:max_details]:
            try:
                html = client.get_text(url)
                if html is None:
                    errors += 1
                    continue
                events = parse_detail(html, url, category_slug=cat)
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
    print(f"  [{SOURCE}] {count} events, {skipped} articles without real date/venue skipped, {errors} errors")


if __name__ == "__main__":
    for i, ev in enumerate(fetch_events(max_pages=1, max_details=5)):
        print(json.dumps(ev, ensure_ascii=False, indent=1))
