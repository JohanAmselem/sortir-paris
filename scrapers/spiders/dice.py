"""
DICE spider — concerts, club nights, comedy, talks in Paris.
Source: https://dice.fm/browse/paris-5b23e8a0e63cc224a4c36a2d[/<type>/<subtype>]

Legal basis: public structured data embedded in the public browse pages
(__NEXT_DATA__ → props.pageProps.events, server-rendered, ~30 events per page; the
"nextCursor" pagination is client-side only, so one page per filter).

Mapping: dates.event_start_date / event_end_date carry an offset; price.amount /
amount_from are CENTIMES (EUR); venues[0].address holds the postcode. The city
lat/lng in the payload is the city centroid, not the venue → not used.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Generator, List, Optional

from spiders.eventbrite_paris import is_off_topic
from utils.event import make_event
from utils.http import BudgetExceeded, PoliteClient
from utils.normalize import IDF_DEPARTMENTS, UNKNOWN_PRICE, extract_zip, price_from_numbers

SOURCE = "dice"
BASE_URL = "https://dice.fm"
PARIS_BROWSE = f"{BASE_URL}/browse/paris-5b23e8a0e63cc224a4c36a2d"

# browse filter → explicit category
FILTERS = [
    ("music/gig", "concerts"),
    ("music/party", "concerts"),
    ("music/dj", "concerts"),
    ("culture/comedy", "spectacles"),
    ("culture/theatre", "theatre"),
    ("culture/talks", "conferences"),
    ("culture/art", "expos"),
    ("culture/film", "cinema"),
    ("culture/workshop", "ateliers"),
]

_NEXT_RE = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)


def _page_props(html: str) -> dict:
    m = _NEXT_RE.search(html or "")
    if not m:
        return {}
    try:
        return (json.loads(m.group(1)).get("props") or {}).get("pageProps") or {}
    except ValueError:
        return {}


def price_from_dice(price: Optional[dict], status: Optional[str] = None) -> dict:
    """DICE price block (centimes) → price dict. 0 on a sold-out/off-sale event = unknown."""
    if not isinstance(price, dict) or (price.get("currency") or "EUR").upper() != "EUR":
        return dict(UNKNOWN_PRICE)
    amount = price.get("amount")
    if amount is None:
        amount = price.get("amount_from")
        if not amount:  # "from 0 €" says nothing about the real price
            return dict(UNKNOWN_PRICE)
    if amount == 0 and (status or "on-sale") != "on-sale":
        return dict(UNKNOWN_PRICE)
    return price_from_numbers(Decimal(int(amount)) / 100)


def city_from_address(address: Optional[str]) -> Optional[str]:
    """'16 Place de la Bourse, 75002 Paris-2E-Arrondissement, France' → 'Paris'."""
    m = re.search(r"\b\d{5}\s+([^,]+)", address or "")
    if not m:
        return None
    city = re.sub(r"-\d+(?:er|e|E|ER)-Arrondissement$", "", m.group(1).strip())
    return city or None


def event_from_dice(e: dict, category_slug: Optional[str] = None) -> Optional[dict]:
    name = e.get("name")
    dates = e.get("dates") or {}
    start = dates.get("event_start_date")
    if not name or not start or not e.get("id"):
        return None
    venues = e.get("venues") or []
    venue = venues[0] if venues else {}
    address = venue.get("address")
    zip_code = extract_zip(address)
    m = re.search(r"\b(\d{5})\b", address or "")
    if m and m.group(1)[:2] not in IDF_DEPARTMENTS:
        return None
    city = city_from_address(address) or (venue.get("city") or {}).get("name")
    if not (zip_code or city):
        return None
    if is_off_topic(name, e.get("one_liner")):
        return None
    status = (e.get("status") or "").lower()
    images = e.get("images") or {}
    url = f"{BASE_URL}/event/{e['id']}"
    return make_event(
        source=SOURCE,
        source_id=f"dice-{e['id']}",
        title=name,
        start=start,
        end=dates.get("event_end_date"),
        description=e.get("one_liner"),
        image_url=images.get("landscape") or images.get("square") or images.get("portrait"),
        price=price_from_dice(e.get("price"), status),
        booking_url=url,
        source_url=url,
        venue_name=venue.get("name"),
        venue_address=address,
        venue_city=city,
        venue_zip=zip_code,
        category_slug=category_slug,
        event_status="cancelled" if "cancel" in status else "scheduled",
        is_online=False,
    )


def parse_browse(html: str, category_slug: Optional[str] = None) -> List[dict]:
    out = []
    for e in _page_props(html).get("events") or []:
        if not isinstance(e, dict):
            continue
        try:
            ev = event_from_dice(e, category_slug)
        except Exception as ex:
            print(f"  [{SOURCE}] bad event {e.get('id')}: {ex}")
            continue
        if ev:
            out.append(ev)
    return out


def fetch_events(days_ahead: int = 60, max_pages: int = 10) -> Generator[dict, None, None]:
    """One browse page per filter (max_pages caps the number of filter pages)."""
    horizon = datetime.now(timezone.utc) + timedelta(days=days_ahead)
    seen: set = set()
    with PoliteClient() as client:
        for i, (path, category) in enumerate(FILTERS[:max_pages]):
            url = f"{PARIS_BROWSE}/{path}"
            try:
                html = client.get_text(url)
            except BudgetExceeded:
                raise
            if html is None or not _page_props(html):
                if i == 0:
                    print(f"  [{SOURCE}] blocked: no __NEXT_DATA__ events on {url}")
                    return
                continue
            kept = 0
            for ev in parse_browse(html, category):
                if ev["source_id"] in seen:
                    continue
                if datetime.fromisoformat(ev["start_date"]) > horizon:
                    continue
                seen.add(ev["source_id"])
                kept += 1
                yield ev
            print(f"  [{SOURCE}] {path}: {kept} events")
