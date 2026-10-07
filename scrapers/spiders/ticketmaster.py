"""
Ticketmaster spider — concerts, theatre, shows around Paris.
Source: Ticketmaster Discovery API v2 (official)
  https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/

Legal basis: official API (free key, 5000 calls/day, 5 req/s).
Env: TICKETMASTER_API_KEY (optional — without it the source is skipped).

Query: countryCode=FR, latlong=48.8566,2.3522, radius=30 km, locale=fr-fr, size=200,
sort=date,asc. Deep paging is limited to size*page < 1000, so the date range is split
into windows (default 7 days) and each window is paginated (≤ 5 pages of 200); a window
that still exceeds the limit is split in two.

Mapping:
- dates.start.dateTime (UTC) when the time is known; localDate only (or timeTBA /
  noSpecificTime / dateTBA) → time unknown; localDate+localTime → Paris local.
- priceRanges min/max (EUR) → centimes; no priceRanges → price unknown.
- classifications segment/genre → category (Sports → skipped).
- _embedded.venues[0] → venue; widest 16_9 image; dates.status.code cancelled → cancelled.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Generator, List, Optional, Tuple

from utils.event import make_event
from utils.http import BudgetExceeded, PoliteClient
from utils.normalize import IDF_DEPARTMENTS, UNKNOWN_PRICE, in_idf, price_from_numbers

SOURCE = "ticketmaster"
API_URL = "https://app.ticketmaster.com/discovery/v2/events.json"
PAGE_SIZE = 200
DEEP_PAGING_LIMIT = 1000  # size * page must stay < 1000

BASE_PARAMS = {
    "countryCode": "FR",
    "latlong": "48.8566,2.3522",
    "radius": "30",
    "unit": "km",
    "locale": "fr-fr",
    "size": str(PAGE_SIZE),
    "sort": "date,asc",
}

ARTS_GENRES = {
    "theatre": "theatre",
    "théâtre": "theatre",
    "dance": "danse",
    "danse": "danse",
    "ballet": "danse",
    "comedy": "spectacles",
    "humour": "spectacles",
    "opera": "concerts",
    "opéra": "concerts",
    "classical": "concerts",
    "fine art": "expos",
    "music": "concerts",
}


def tm_datetime(dt: datetime) -> str:
    """Discovery API format: YYYY-MM-DDTHH:mm:ssZ (UTC)."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def category_for(classifications) -> Tuple[Optional[str], bool]:
    """→ (category_slug or None, skip). Sports events are skipped."""
    cls = None
    for c in classifications or []:
        if isinstance(c, dict) and (c.get("primary") or cls is None):
            cls = c
    if not cls:
        return None, False
    segment = ((cls.get("segment") or {}).get("name") or "").strip().lower()
    genre = ((cls.get("genre") or {}).get("name") or "").strip().lower()
    if segment in ("sports", "sport"):
        return None, True
    if segment in ("music", "musique"):
        return "concerts", False
    if segment in ("film", "cinéma", "cinema"):
        return "cinema", False
    if segment in ("arts & theatre", "arts et théâtre", "arts & théâtre"):
        return ARTS_GENRES.get(genre, "spectacles"), False
    return None, False  # Miscellaneous / Undefined → let detect_category decide


def pick_image(images) -> Optional[str]:
    best, best_w = None, -1
    for im in images or []:
        if not isinstance(im, dict) or im.get("ratio") != "16_9" or not im.get("url"):
            continue
        w = im.get("width") or 0
        if w > best_w:
            best, best_w = im["url"], w
    if best:
        return best
    for im in images or []:
        if isinstance(im, dict) and im.get("url"):
            return im["url"]
    return None


def price_from_ranges(ranges) -> dict:
    lows, highs = [], []
    for r in ranges or []:
        if not isinstance(r, dict) or (r.get("currency") or "").upper() != "EUR":
            continue
        if r.get("min") is not None:
            lows.append(r["min"])
        if r.get("max") is not None:
            highs.append(r["max"])
    if not lows and not highs:
        return dict(UNKNOWN_PRICE)
    allv = lows + highs
    return price_from_numbers(min(allv), max(allv))


def _when(block: Optional[dict]):
    """dates.start / dates.end → value for make_event (UTC string, naive local or date-only)."""
    if not isinstance(block, dict):
        return None
    if block.get("dateTBA") or block.get("dateTBD"):
        return None
    local_date = block.get("localDate")
    if block.get("timeTBA") or block.get("noSpecificTime"):
        return local_date
    if block.get("dateTime"):
        return block["dateTime"]  # UTC with Z
    if local_date and block.get("localTime"):
        return f"{local_date}T{block['localTime']}"  # naive → Paris local
    return local_date


def event_from_tm(e: dict) -> Optional[dict]:
    if not e.get("id") or not e.get("name"):
        return None
    category, skip = category_for(e.get("classifications"))
    if skip:
        return None
    dates = e.get("dates") or {}
    start = _when(dates.get("start"))
    if not start:
        return None
    venues = (e.get("_embedded") or {}).get("venues") or []
    v = venues[0] if venues else {}
    loc = v.get("location") or {}
    lat, lng = loc.get("latitude"), loc.get("longitude")
    zip_code = v.get("postalCode")
    if lat and lng:
        if not in_idf(lat, lng):
            return None
    elif not (zip_code and str(zip_code)[:2] in IDF_DEPARTMENTS):
        return None
    status = ((dates.get("status") or {}).get("code") or "").lower()
    genre_tags = []
    for c in e.get("classifications") or []:
        for k in ("segment", "genre", "subGenre"):
            n = ((c or {}).get(k) or {}).get("name")
            if n and n.lower() != "undefined" and n not in genre_tags:
                genre_tags.append(n)
    attractions = [a.get("name") for a in (e.get("_embedded") or {}).get("attractions") or [] if a.get("name")]
    return make_event(
        source=SOURCE,
        source_id=f"tm-{e['id']}",
        title=e["name"],
        start=start,
        end=_when(dates.get("end")),
        description=e.get("info") or e.get("description") or e.get("pleaseNote"),
        image_url=pick_image(e.get("images")),
        price=price_from_ranges(e.get("priceRanges")),
        booking_url=e.get("url"),
        source_url=e.get("url"),
        venue_name=v.get("name"),
        venue_address=(v.get("address") or {}).get("line1"),
        venue_city=(v.get("city") or {}).get("name"),
        venue_zip=zip_code,
        venue_lat=lat,
        venue_lng=lng,
        category_slug=category,
        category_raw=", ".join(genre_tags) or None,
        tags=attractions + genre_tags,
        event_status="cancelled" if status == "cancelled" else "scheduled",
        is_online=False,
    )


def parse_api(data) -> Tuple[List[dict], dict]:
    """One Discovery API response → (events, page info)."""
    if not isinstance(data, dict):
        return [], {}
    out = []
    for e in (data.get("_embedded") or {}).get("events") or []:
        if not isinstance(e, dict):
            continue
        try:
            ev = event_from_tm(e)
        except Exception as ex:
            print(f"  [{SOURCE}] bad event {e.get('id')}: {ex}")
            continue
        if ev:
            out.append(ev)
    return out, data.get("page") or {}


def build_params(api_key: str, start: datetime, end: datetime, page: int) -> dict:
    """Query params (passed via httpx params= so the key never appears in our logs)."""
    params = dict(BASE_PARAMS)
    params.update({
        "apikey": api_key,
        "startDateTime": tm_datetime(start),
        "endDateTime": tm_datetime(end),
        "page": str(page),
    })
    return params


def fetch_events(days_ahead: int = 90, window_days: int = 7, max_requests: int = 200) -> Generator[dict, None, None]:
    api_key = os.environ.get("TICKETMASTER_API_KEY")
    if not api_key:
        print(f"  [{SOURCE}] TICKETMASTER_API_KEY not set, skipping")
        return
    now = datetime.now(timezone.utc).replace(microsecond=0)
    horizon = now + timedelta(days=days_ahead)
    windows: List[Tuple[datetime, datetime]] = []
    t = now
    while t < horizon:
        windows.append((t, min(t + timedelta(days=window_days), horizon)))
        t += timedelta(days=window_days)

    seen: set = set()
    requests = 0
    max_pages = DEEP_PAGING_LIMIT // PAGE_SIZE  # pages 0..4 → size*page < 1000
    with PoliteClient(delay=0.3) as client:
        while windows:
            w_start, w_end = windows.pop(0)
            page = 0
            while page < max_pages:
                if requests >= max_requests:
                    print(f"  [{SOURCE}] max_requests={max_requests} reached")
                    return
                requests += 1
                try:
                    data = client.get_json(API_URL, params=build_params(api_key, w_start, w_end, page))
                except BudgetExceeded:
                    raise
                if data is None:
                    if requests == 1:
                        print(f"  [{SOURCE}] API unreachable or key refused — stopping")
                        return
                    break
                events, info = parse_api(data)
                total = int(info.get("totalElements") or 0)
                if page == 0 and total >= DEEP_PAGING_LIMIT and (w_end - w_start) > timedelta(hours=12):
                    mid = w_start + (w_end - w_start) / 2
                    windows[:0] = [(w_start, mid), (mid, w_end)]
                    break  # re-query the two halves
                for ev in events:
                    if ev["source_id"] not in seen:
                        seen.add(ev["source_id"])
                        yield ev
                if page + 1 >= int(info.get("totalPages") or 0):
                    break
                page += 1
    print(f"  [{SOURCE}] {len(seen)} events from {requests} requests")
