"""
L'Officiel des Spectacles spider.
Source: https://www.offi.fr (HTML scraping of schema.org microdata).

Strategy:
  1. Category programme pages (/<cat>/programme.html?npage=N, 15 cards a page),
     paginated until the last page (theatre ~140 pages, concerts ~190 pages,
     2026-10). Each card is a schema.org/*Event microdata scope with name, url,
     image, Place (name, zip, locality) and ISO startDate/endDate → a complete
     listing-level event. The card's price tag ("22,5-129,5 €") is read too.
     Concert cards carry an empty startDate meta first and the real one
     ("2026-10-09 19:45:00", with the time) at the bottom of the card: the first
     NON-EMPTY startDate is used (before 2026-10-09 every concert card was dropped).
  2. Cards still without a price are enriched from their detail page (up to
     `max_details`, while the time budget allows): AggregateOffer price or the
     "Tarifs :" text, street address and geo coordinates.
  Cinema is NOT scraped here (Offi gives no per-venue showtimes in this markup;
  cinema is handled by the allocine spider). ScreeningEvent cards are skipped.
  Guided-tour cards without a Place (meeting point only on the detail page) are skipped.
  Theatre / exhibition dates are date-only: time_known=False (never invented);
  concerts have real times.
  Zone: Paris + petite couronne only (postcodes 75, 92, 93, 94).
"""

from __future__ import annotations

import json
import re
from typing import Generator, List, Optional
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from utils.event import make_event
from utils.http import BudgetExceeded, PoliteClient, current_budget
from utils.normalize import (
    SERVICE_DEPARTMENTS,
    absolute_url,
    clean_text,
    extract_zip,
    parse_price_fr,
    price_from_numbers,
)

SOURCE = "offi"
BASE_URL = "https://www.offi.fr"

# category path → our category slug (None → detect_category)
CATEGORIES = {
    "theatre": "theatre",
    "concerts": "concerts",
    "expositions-musees": "expos",
    "enfants": None,
    # "visites-conferences" is not crawled: its cards carry no Place (only the
    # guide's name), so none passes the zone check (checked 2026-10-09).
}

# Offi "theatre" universe = every stage show: refine the category from the card tags.
# (tag, case-insensitive) → slug; first match wins, checked in this order.
_STAGE_TAG_CATEGORY = [
    ("opéra", "concerts"), ("opera", "concerts"), ("lyrique", "concerts"), ("opérette", "concerts"),
    ("danse", "danse"), ("ballet", "danse"),
    ("humour", "spectacles"), ("one man show", "spectacles"), ("one woman show", "spectacles"),
    ("stand up", "spectacles"), ("comedy club", "spectacles"), ("seul(e) en scène", "spectacles"),
    ("imitation", "spectacles"), ("improvisation", "spectacles"), ("hypnose", "spectacles"),
    ("magie", "spectacles"), ("cirque", "spectacles"), ("cabaret", "spectacles"),
    ("spectacles musicaux", "spectacles"), ("spectacle musical", "spectacles"),
    ("comédie musicale", "spectacles"),
]

# Budget left (seconds) under which no more detail pages are fetched.
DETAIL_BUDGET_MARGIN = 60

_EVENT_ITEMTYPE = re.compile(r"schema\.org/\w*Event$", re.I)
_ID_RE = re.compile(r"-(\d+)\.html$")
_CARD_ID_RE = re.compile(r'id="minifiche_(\d+)"')
_NPAGE_RE = re.compile(r"programme\.html\?npage=(\d+)")


def _prop(scope, name: str) -> Optional[str]:
    if scope is None:
        return None
    el = scope.find(attrs={"itemprop": name})
    if el is None:
        return None
    val = el.get("content")
    if val is None:
        val = el.get_text(" ", strip=True)
    return clean_text(val)


def _own_prop(scope, name: str) -> Optional[str]:
    """First NON-EMPTY itemprop belonging to `scope` itself (not to a nested
    itemscope like Place). Concert cards have an empty startDate meta before the real one."""
    for el in scope.find_all(attrs={"itemprop": name}):
        parent = el.find_parent(attrs={"itemscope": True})
        if parent is scope:
            val = el.get("content")
            if val is None:
                val = el.get_text(" ", strip=True)
            val = clean_text(val)
            if val:
                return val
    return None


def _city_from_locality(locality: Optional[str]) -> Optional[str]:
    if not locality:
        return None
    return "Paris" if locality.lower().startswith("paris") else locality


def _zip_ok(zip_code: Optional[str]) -> bool:
    """Paris + petite couronne only."""
    return bool(zip_code) and zip_code[:2] in SERVICE_DEPARTMENTS


def stage_category(tags: List[str]) -> Optional[str]:
    """Category of a card in the 'theatre' universe from its tags; None → plain theatre."""
    low = [t.lower() for t in tags if t]
    # Specific tags first ("Ballet", "Opéra"); the umbrella "Opéras / Ballets-Danse" last.
    low = [t for t in low if "/" not in t] + [t for t in low if "/" in t]
    for t in low:
        if "opéras / ballets" in t:
            return "danse"  # opera productions carry a specific "Opéra"/"Lyrique" tag, matched above
        for needle, slug in _STAGE_TAG_CATEGORY:
            if needle in t:
                return slug
    return None


def _price_tag(tags: List[str]) -> Optional[dict]:
    for t in tags:
        if "€" in t:
            price = parse_price_fr(t)
            if price["price_status"] != "unknown":
                return price
    return None


def _category_from_url(url: str) -> Optional[str]:
    seg = urlparse(url).path.strip("/").split("/")[0]
    return CATEGORIES.get(seg)


def _source_id(url: str) -> str:
    m = _ID_RE.search(url or "")
    return m.group(1) if m else url


# ─────────────────────────── pure parsers ───────────────────────────

def parse_listing(html: str, category_slug: Optional[str] = None) -> List[dict]:
    """Programme page → listing-level events (date-only, price unknown)."""
    soup = BeautifulSoup(html or "", "html.parser")
    out: List[dict] = []
    for card in soup.find_all(attrs={"itemtype": _EVENT_ITEMTYPE}):
        try:
            ev = _parse_card(card, category_slug)
        except Exception as e:  # one broken card never kills the page
            print(f"  [{SOURCE}] card error: {e}")
            continue
        if ev:
            out.append(ev)
    return out


def _parse_card(card, category_slug: Optional[str]) -> Optional[dict]:
    if "screeningevent" in (card.get("itemtype") or "").lower():
        return None  # cinema → allocine
    title_a = card.select_one(".event-title a[href]") or card.find("a", href=_ID_RE)
    if title_a is None:
        return None
    url = absolute_url(BASE_URL, title_a["href"])
    title = clean_text(title_a.get_text(" ", strip=True))
    start = _own_prop(card, "startDate")
    if not title or not start:
        return None
    place = card.find(attrs={"itemprop": "location"})
    zip_code = _prop(place, "postalCode")
    if not _zip_ok(zip_code):
        return None
    img = card.find("img", attrs={"itemprop": "image"})
    all_tags = [t for t in (clean_text(s.get_text()) for s in card.select(".tags-container span")) if t]
    price = _price_tag(all_tags)
    tags = [t for t in all_tags if "€" not in t and "%" not in t and t.upper() != "RÉSERVATION"]
    if category_slug == "theatre":
        category_slug = stage_category(tags) or "theatre"
    status = (_own_prop(card, "eventStatus") or "").lower()
    return make_event(
        source=SOURCE,
        source_id=_source_id(url),
        title=title,
        start=start,
        end=_own_prop(card, "endDate"),
        midnight_unknown=True,
        description=_own_prop(card, "description"),
        image_url=absolute_url(BASE_URL, img.get("src")) if img else None,
        price=price,
        source_url=url,
        booking_url=url,
        venue_name=_prop(place, "name"),
        venue_address=_prop(place, "streetAddress") or None,
        venue_city=_city_from_locality(_prop(place, "addressLocality")),
        venue_zip=zip_code,
        category_slug=category_slug if category_slug is not None else _category_from_url(url),
        category_raw=", ".join(tags) or None,
        tags=tags,
        event_status="cancelled" if "cancel" in status else "scheduled",
    )


def _tarifs_text(soup) -> Optional[str]:
    for b in soup.find_all("b"):
        if clean_text(b.get_text() or "").lower().startswith("tarif"):
            parts = []
            for sib in b.next_siblings:
                if getattr(sib, "name", None) in ("br", "b"):
                    break
                parts.append(sib.get_text(" ", strip=True) if hasattr(sib, "get_text") else str(sib))
            return clean_text(" ".join(parts)) or None
    return None


def parse_detail(html: str, url: str) -> List[dict]:
    """Detail page → [event] with price, address and geo; [] if no Event scope/date."""
    soup = BeautifulSoup(html or "", "html.parser")
    scope = soup.find(attrs={"itemtype": _EVENT_ITEMTYPE})
    if scope is None:
        return []
    if "screeningevent" in (scope.get("itemtype") or "").lower():
        return []
    h1 = soup.find("h1")
    title = clean_text(h1.get_text(" ", strip=True)) if h1 else None
    start = _own_prop(scope, "startDate")
    if not title or not start:
        return []

    place = scope.find(attrs={"itemprop": "location", "itemscope": True})
    zip_code = _prop(place, "postalCode")
    if not _zip_ok(zip_code):
        return []
    geo = place.find(attrs={"itemprop": "geo"}) if place else None

    price = None
    offer = scope.find(attrs={"itemprop": "offers"})
    if offer is not None:
        low_el = offer.find(attrs={"itemprop": "lowPrice"})
        high_el = offer.find(attrs={"itemprop": "highPrice"})
        low = low_el.get("content") if low_el else _prop(offer, "price")
        high = high_el.get("content") if high_el else None
        if low or high:
            price = price_from_numbers(low, high)
    if price is None:
        tarifs = _tarifs_text(soup)
        if tarifs:
            price = parse_price_fr(tarifs)

    img = scope.find("img", attrs={"itemprop": "image"})
    desc_meta = soup.find("meta", attrs={"name": "description"})
    status = (_own_prop(scope, "eventStatus") or "").lower()
    return [make_event(
        source=SOURCE,
        source_id=_source_id(url),
        title=title,
        start=start,
        end=_own_prop(scope, "endDate"),
        midnight_unknown=True,
        description=desc_meta.get("content") if desc_meta else None,
        image_url=absolute_url(BASE_URL, img.get("src")) if img else None,
        price=price,
        source_url=url,
        booking_url=url,
        venue_name=_prop(place, "name"),
        venue_address=_prop(place, "streetAddress") or None,
        venue_city=_city_from_locality(_prop(place, "addressLocality")),
        venue_zip=zip_code or extract_zip(_prop(place, "addressLocality")),
        venue_lat=_prop(geo, "latitude"),
        venue_lng=_prop(geo, "longitude"),
        category_slug=_category_from_url(url),
        event_status="cancelled" if "cancel" in status else "scheduled",
    )]


# ─────────────────────────── network ───────────────────────────

def merge_detail(listing_ev: dict, detail_ev: dict) -> dict:
    """Listing event + what only the detail page has (price, street address, geo,
    longer description). Dates, title and category stay the listing ones."""
    ev = dict(listing_ev)
    for k in ("price_min", "price_max", "is_free", "price_status"):
        ev[k] = detail_ev[k]
    for k in ("venue_address", "venue_lat", "venue_lng"):
        if detail_ev.get(k) is not None:
            ev[k] = detail_ev[k]
    if len(detail_ev.get("description") or "") > len(ev.get("description") or ""):
        ev["description"] = detail_ev["description"]
        ev["short_desc"] = detail_ev.get("short_desc")
    return ev


def last_page(html: str) -> int:
    """Highest npage in the pagination links (1 when there is none)."""
    pages = [int(x) for x in _NPAGE_RE.findall(html or "")]
    return max(pages) if pages else 1


def _budget_left() -> float:
    return current_budget().remaining()


def fetch_events(max_pages: int = 250, max_details: int = 150) -> Generator[dict, None, None]:
    """Every programme page of every category (stops at the first empty page or
    after `max_pages`), then detail pages for cards still without a price
    (up to `max_details`, and only while more than DETAIL_BUDGET_MARGIN s of budget remain)."""
    seen = set()
    pending: List[dict] = []  # listing events without price, enriched at the end
    details_done = errors = count = 0
    per_cat = {}
    with PoliteClient() as client:
        for cat_path, cat_slug in CATEGORIES.items():
            n_cat = 0
            n_pages = 1
            raw_seen: set = set()
            page = 0
            while page < min(n_pages, max_pages):
                if _budget_left() < 2 * DETAIL_BUDGET_MARGIN:
                    print(f"  [{SOURCE}] time budget nearly spent — stopping listings at {cat_path} page {page}")
                    break
                page += 1
                url = f"{BASE_URL}/{cat_path}/programme.html" + (f"?npage={page}" if page > 1 else "")
                html = client.get_text(url)
                if html is None:
                    if page == 1:
                        print(f"  [{SOURCE}] blocked or unavailable: {url}")
                    break
                if page == 1:
                    n_pages = last_page(html)
                raw_ids = set(_CARD_ID_RE.findall(html))
                if not raw_ids or raw_ids <= raw_seen:
                    break  # past the last page (Offi then repeats a page)
                raw_seen |= raw_ids
                new = [e for e in parse_listing(html, cat_slug) if e["source_id"] not in seen]
                for ev in new:
                    seen.add(ev["source_id"])
                    n_cat += 1
                    if ev["price_status"] == "unknown" and len(pending) < max_details:
                        pending.append(ev)  # yielded after the detail pass
                        continue
                    count += 1
                    yield ev
            per_cat[cat_path] = n_cat

        for ev in pending:
            if _budget_left() > DETAIL_BUDGET_MARGIN and ev.get("source_url"):
                details_done += 1
                try:
                    dhtml = client.get_text(ev["source_url"])
                    detailed = parse_detail(dhtml, ev["source_url"]) if dhtml else []
                    if detailed:
                        ev = merge_detail(ev, detailed[0])
                except BudgetExceeded:
                    raise
                except Exception as e:
                    errors += 1
                    print(f"  [{SOURCE}] detail error {ev['source_url']}: {e}")
            count += 1
            yield ev
    if count == 0:
        print(f"  [{SOURCE}] no events parsed — listing markup changed or site unavailable")
    print(f"  [{SOURCE}] {count} events {per_cat} ({details_done} enriched from detail pages, {errors} errors)")


if __name__ == "__main__":
    for i, ev in enumerate(fetch_events(max_pages=1, max_details=2)):
        print(json.dumps(ev, ensure_ascii=False, indent=1))
        if i >= 3:
            break
