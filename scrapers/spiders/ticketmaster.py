"""
Ticketmaster spider — concerts, theatre, shows around Paris.
Source: Ticketmaster Discovery API v2 (official)
  https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/

Legal basis: official API (free key, 5000 calls/day, 5 req/s).
Env: TICKETMASTER_API_KEY (optional — without it the source is skipped).

Query: countryCode=FR, latlong=48.8566,2.3522, radius=18 km, locale=fr-fr, size=200,
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
from typing import Dict, Generator, List, Optional, Tuple

from utils.event import make_event, stable_id
from utils.matching import dedup_title
from utils.http import BudgetExceeded, PoliteClient
import re
from collections import Counter

from utils.normalize import IDF_DEPARTMENTS, SERVICE_DEPARTMENTS, UNKNOWN_PRICE, in_idf, price_from_numbers

SOURCE = "ticketmaster"
API_URL = "https://app.ticketmaster.com/discovery/v2/events.json"
PAGE_SIZE = 200
DEEP_PAGING_LIMIT = 1000  # size * page must stay < 1000

BASE_PARAMS = {
    "countryCode": "FR",
    "latlong": "48.8566,2.3522",
    "radius": "18",  # Paris + petite couronne (Nanterre 11 km, Créteil 12 km, Orly 14 km)
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


# Products that are not outings: parking, passes, upgrades, gift cards, hospitality…
NOT_AN_EVENT = re.compile(
    r"\b(parking|stationnement|pass\b|passeport|billet dat[ée]|carte cadeau|gift card|upgrade|"
    r"surclassement|hospitalit|vip package|package vip|forfait|abonnement|souvenir|merch|"
    r"visite libre|entr[ée]e (?:au parc|parc)|disneyland|parc ast[ée]rix)\b",
    re.I,
)

STATS: Counter = Counter()


def event_from_tm(e: dict) -> Optional[dict]:
    if not e.get("id") or not e.get("name"):
        return None
    if NOT_AN_EVENT.search(e["name"]):
        STATS["skip:not_an_event"] += 1
        return None
    venue0 = ((e.get("_embedded") or {}).get("venues") or [{}])[0]
    zip0 = str(venue0.get("postalCode") or "")
    if re.fullmatch(r"\d{5}", zip0) and zip0[:2] not in SERVICE_DEPARTMENTS:
        STATS["skip:out_of_zone"] += 1
        return None
    cls0 = next((c for c in e.get("classifications") or [] if isinstance(c, dict)), {})
    STATS[f"type:{(cls0.get('segment') or {}).get('name')}/{(cls0.get('genre') or {}).get('name')}"] += 1
    STATS[f"venue:{venue0.get('name')}"] += 1
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


SERIES_MIN = 4  # sessions of the same show at the same venue → one event with a date range


def collapse_series(events: List[dict]) -> List[dict]:
    """Ticketmaster lists every session (museum time slot, each night of a run) as its own
    event. Same title + same venue with SERIES_MIN+ sessions → one event spanning them."""
    groups: Dict[Tuple[str, str], List[dict]] = {}
    for ev in events:
        key = (dedup_title(ev.get("title")), (ev.get("venue_name") or "").strip().lower())
        groups.setdefault(key, []).append(ev)
    out: List[dict] = []
    for (tkey, vkey), evs in groups.items():
        live = [e for e in evs if e.get("event_status") != "cancelled"]
        if len(live) < SERIES_MIN:
            out.extend(evs)
            continue
        live.sort(key=lambda e: e["start_date"])
        first = dict(live[0])
        last_end = max((e.get("end_date") or e["start_date"]) for e in live)
        first["end_date"] = last_end
        first["time_known"] = len({e["start_date"][11:16] for e in live}) == 1 and live[0]["time_known"]
        first["source_id"] = f"tm-series-{stable_id(tkey, vkey)[:16]}"
        out.append(first)
    return out


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
    collected: List[dict] = []
    requests = 0
    max_pages = DEEP_PAGING_LIMIT // PAGE_SIZE  # pages 0..4 → size*page < 1000
    with PoliteClient(delay=0.3) as client:
        while windows:
            w_start, w_end = windows.pop(0)
            page = 0
            while page < max_pages:
                if requests >= max_requests:
                    print(f"  [{SOURCE}] max_requests={max_requests} reached")
                    windows = []
                    break
                requests += 1
                try:
                    data = client.get_json(API_URL, params=build_params(api_key, w_start, w_end, page))
                except BudgetExceeded:
                    print(f"  [{SOURCE}] budget reached — keeping what was fetched")
                    windows = []
                    break
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
                        collected.append(ev)
                if page + 1 >= int(info.get("totalPages") or 0):
                    break
                page += 1
    series = collapse_series(collected)
    print(f"  [{SOURCE}] {len(seen)} sessions from {requests} requests → {len(series)} events")
    yield from series
    skipped = {k: v for k, v in STATS.items() if k.startswith("skip:")}
    types = [(k[5:], v) for k, v in STATS.most_common() if k.startswith("type:")][:12]
    venues = [(k[6:], v) for k, v in STATS.most_common() if k.startswith("venue:")][:12]
    print(f"  [{SOURCE}] skipped {skipped}")
    print(f"  [{SOURCE}] top types {types}")
    print(f"  [{SOURCE}] top venues {venues}")
