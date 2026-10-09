"""
TheatreOnline spider.
Source: https://www.theatreonline.com (ticketing platform; HTML scraping of schema.org microdata).

The listing /Spectacles/Liste?page=N (30 shows/page, ~95 pages / ~2,800 shows across
France on 2026-10-09; every page is read until the first empty one) has one schema.org/Event
microdata card per show with: name, url, image, location text ("Théâtre Edouard VII,
Paris 9e" / "Avant-Seine, Colombes (92)"), ISO startDate/endDate metas, a visible
date line ("du 16 sept. 2026 au 10 janv. 2027"), tags (genre, price "18 - 46,5 €").

Dates: the ISO metas are used (no month-order / year-rollover ambiguity); the
visible line is only a fallback, parsed with parse_date_fr (durations such as
"1h40" are never read as times). Show times are not on the listing → time unknown.
No JSON-LD on listing or detail pages (checked 2026-10-07). No robots.txt (404).
Zone: Paris + petite couronne only — suburban venues are kept for departments
92, 93 and 94 (the card gives "(92)", not the postcode).

Venue addresses: the cards only give "Théâtre X, Paris 9e". Each venue has a page
(/Theatre/<slug>/<id>, linked from any of its show pages) with schema.org Place microdata
(streetAddress, postalCode, addressLocality, geo). After the listing, up to
`max_venues` venues are looked up (2 requests each, venues without postcode first),
within the time budget; their events get the real address, postcode and coordinates.
"""

from __future__ import annotations

import json
import re
from typing import Generator, List, Optional, Tuple

from bs4 import BeautifulSoup

from utils.dates import parse_date_fr
from utils.event import make_event
from utils.http import BudgetExceeded, PoliteClient, current_budget
from utils.normalize import (
    SERVICE_DEPARTMENTS,
    absolute_url,
    arrondissement_from_zip,
    clean_text,
    in_service_zone,
    normalize_zip,
    parse_price_fr,
)

SOURCE = "theatreonline"
BASE_URL = "https://www.theatreonline.com"
LISTING_URL = f"{BASE_URL}/Spectacles/Liste"

_ID_RE = re.compile(r"/Spectacle/[^/]+/(\d+)")
_PARIS_RE = re.compile(r"^paris\s*(\d{1,2})\s*(?:e|er|eme)?$", re.I)
_DEPT_RE = re.compile(r"^(.*?)\s*\((\d{2,3})\)$")
_CARD_RE = re.compile(r'<div[^>]+class="spectacle-item[^"]*"[^>]*itemscope')
_THEATRE_LINK_RE = re.compile(r'href="(/Theatre/[^"/?#]+/\d+)"')
VENUE_LOOKUP_MIN_BUDGET = 120  # seconds kept in reserve: events are yielded after the lookups


def parse_location(text: Optional[str]) -> Optional[Tuple[str, str, Optional[str]]]:
    """'Théâtre Edouard VII, Paris 9e' → (venue, 'Paris', '75009');
    'Avant-Seine, Colombes (92)' → (venue, 'Colombes', None).
    None outside Paris + petite couronne (75, 92, 93, 94)."""
    text = clean_text(text)
    if not text or "," not in text:
        return None
    venue, place = [clean_text(x) for x in text.rsplit(",", 1)]
    m = _PARIS_RE.match(place or "")
    if m:
        n = int(m.group(1))
        if not 1 <= n <= 20:
            return None
        return venue, "Paris", f"750{n:02d}"
    if (place or "").lower() == "paris":
        return venue, "Paris", None
    m = _DEPT_RE.match(place or "")
    if m and m.group(2) in SERVICE_DEPARTMENTS:
        return venue, m.group(1), None
    return None


def _category(tags: List[str]) -> str:
    low = [t.lower() for t in tags]
    if any("humour" in t or "one (wo)man" in t or "stand-up" in t for t in low):
        return "spectacles"
    if any(t.startswith("musique") for t in low):
        others = [t for t in low if not t.startswith("musique")]
        if any("danse" in t for t in others):
            return "danse"
        if any(k in t for t in others for k in ("concert", "jazz", "classique", "opéra", "opera", "récital")):
            return "concerts"
        return "spectacles"
    return "theatre"


def parse_listing(html: str, today=None) -> List[dict]:
    soup = BeautifulSoup(html or "", "html.parser")
    out: List[dict] = []
    for card in soup.select("div.spectacle-item[itemscope]"):
        try:
            ev = _parse_card(card, today)
        except Exception as e:
            print(f"  [{SOURCE}] card error: {e}")
            continue
        if ev:
            out.append(ev)
    return out


def _parse_card(card, today=None) -> Optional[dict]:
    a = card.select_one("a.titre-spectacle[href]")
    if a is None:
        return None
    url = absolute_url(BASE_URL, a["href"])
    m = _ID_RE.search(url or "")
    if not m:
        return None
    name_el = a.find(attrs={"itemprop": "name"}) or a
    title = clean_text(name_el.get_text(" ", strip=True))
    if not title:
        return None

    loc_el = card.find(attrs={"itemprop": "location"})
    loc = parse_location(loc_el.get_text(" ", strip=True) if loc_el else None)
    if loc is None:
        return None  # no venue or outside Île-de-France
    venue, city, zip_code = loc

    start_meta = card.find("meta", attrs={"itemprop": "startDate"})
    end_meta = card.find("meta", attrs={"itemprop": "endDate"})
    start = start_meta.get("content") if start_meta else None
    end = end_meta.get("content") if end_meta else None
    when = None
    if not start:
        dates_el = card.select_one(".spectacle-item-dates")
        when = parse_date_fr(dates_el.get_text(" ", strip=True), today=today) if dates_el else None
        if when is None or when.start is None:
            return None
    if end == start:
        end = None

    tags = [clean_text(s.get_text(" ", strip=True)) for s in card.select(".tags span")]
    tags = [t for t in tags if t]
    price_tag = next((t for t in tags if "€" in t), None)
    genre_tags = [t for t in tags if "€" not in t and "%" not in t]

    img = card.find("img", attrs={"itemprop": "image"})
    desc_el = next((p for p in card.find_all("p") if p.get("itemprop") != "location"), None)
    return make_event(
        source=SOURCE,
        source_id=m.group(1),
        title=title,
        start=start if when is None else None,
        end=end if when is None else None,
        when=when,
        description=desc_el.get_text(" ", strip=True) if desc_el else None,
        image_url=absolute_url(BASE_URL, img.get("src")) if img else None,
        price=parse_price_fr(price_tag) if price_tag else None,
        source_url=url,
        booking_url=url,
        venue_name=venue,
        venue_city=city,
        venue_zip=zip_code,
        category_slug=_category(genre_tags),
        tags=genre_tags,
    )


def parse_theatre_link(html: str) -> Optional[str]:
    """Show page → absolute URL of its venue page."""
    m = _THEATRE_LINK_RE.search(html or "")
    return absolute_url(BASE_URL, m.group(1)) if m else None


def parse_venue_page(html: str) -> Optional[dict]:
    """Venue page → {venue_address, venue_zip, venue_city, venue_lat, venue_lng} from the
    schema.org Place microdata (None when the page has no postal address)."""
    soup = BeautifulSoup(html or "", "html.parser")
    addr = soup.find(attrs={"itemprop": "address", "itemscope": True})
    if addr is None:
        return None

    def meta(root, prop):
        el = root.find(attrs={"itemprop": prop}) if root is not None else None
        if el is None:
            return None
        return clean_text(el.get("content") or el.get_text(" ", strip=True))

    zip_code = normalize_zip(meta(addr, "postalCode"))
    out = {
        "venue_address": meta(addr, "streetAddress"),
        "venue_zip": zip_code,
        "venue_city": meta(addr, "addressLocality"),
        "venue_lat": None,
        "venue_lng": None,
    }
    place = addr.find_parent(attrs={"itemscope": True})
    geo = place.find(attrs={"itemprop": "geo"}) if place is not None else None
    try:
        lat, lng = float(meta(geo, "latitude")), float(meta(geo, "longitude"))
        if in_service_zone(lat, lng):
            out["venue_lat"], out["venue_lng"] = lat, lng
    except (TypeError, ValueError):
        pass
    return out if (out["venue_address"] or zip_code) else None


def apply_venue_info(events: List[dict], venue_name: str, info: dict) -> int:
    """Fill the events of one venue with its page's address. Returns #events changed."""
    n = 0
    for ev in events:
        if ev.get("venue_name") != venue_name:
            continue
        for k in ("venue_address", "venue_zip", "venue_lat", "venue_lng"):
            if info.get(k) is not None:
                ev[k] = info[k]
        if info.get("venue_city") and not ev.get("venue_city"):
            ev["venue_city"] = info["venue_city"]
        ev["venue_arrondissement"] = arrondissement_from_zip(ev.get("venue_zip"))
        n += 1
    return n


def enrich_venues(events: List[dict], client, max_venues: int = 120) -> int:
    """Look up venue pages (venues without postcode first). Returns #venues found."""
    first_url: dict = {}
    for ev in events:
        first_url.setdefault(ev.get("venue_name"), ev.get("source_url"))
    order = sorted(first_url, key=lambda v: (any(e.get("venue_zip") for e in events
                                                if e.get("venue_name") == v), v or ""))
    found = 0
    budget = current_budget()
    for venue in order[:max_venues]:
        if not venue or not first_url[venue] or budget.remaining() < VENUE_LOOKUP_MIN_BUDGET:
            break
        theatre_url = parse_theatre_link(client.get_text(first_url[venue]) or "")
        if not theatre_url:
            continue
        info = parse_venue_page(client.get_text(theatre_url) or "")
        if info:
            apply_venue_info(events, venue, info)
            found += 1
    return found


def fetch_events(max_pages: int = 150, max_venues: int = 120) -> Generator[dict, None, None]:
    """Every listing page (stops at the first page without new cards — past the last
    page the site redirects to page 1 — or after `max_pages`), then venue addresses."""
    seen = set()
    raw_seen: set = set()
    events: List[dict] = []
    pages = 0
    with PoliteClient() as client:
        try:
            for page in range(1, max_pages + 1):
                html = client.get_text(f"{LISTING_URL}?page={page}")
                if html is None:
                    if page == 1:
                        print(f"  [{SOURCE}] blocked or unavailable: listing page 1 — nothing to do")
                    break
                if not _CARD_RE.search(html):
                    break  # past the last page (the page still mentions the CSS class, not a card)
                raw_ids = set(_ID_RE.findall(html))
                if raw_ids <= raw_seen:
                    break  # past the last page the site redirects to page 1: nothing new
                raw_seen |= raw_ids
                pages += 1
                for ev in parse_listing(html):
                    if ev["source_id"] in seen:
                        continue
                    seen.add(ev["source_id"])
                    events.append(ev)
                if current_budget().remaining() < VENUE_LOOKUP_MIN_BUDGET:
                    print(f"  [{SOURCE}] time budget nearly spent: stopping the listing")
                    break
            venues = enrich_venues(events, client, max_venues=max_venues) if max_venues else 0
        except BudgetExceeded:
            venues = 0
            print(f"  [{SOURCE}] budget exhausted — keeping {len(events)} shows")
    print(f"  [{SOURCE}] {len(events)} shows in Paris + petite couronne from {pages} listing pages, "
          f"{venues} venue addresses")
    yield from events


if __name__ == "__main__":
    for ev in list(fetch_events(max_pages=1))[:3]:
        print(json.dumps(ev, ensure_ascii=False, indent=1))
