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

from utils.event import make_event
from utils.series import collapse_series as shared_collapse_series
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
    # fr-fr alone returns classifications as bare ids (no segment/genre names): every
    # event was "None/None", so no genre ("Metal", "Rock"…) and no category from the
    # source. Fall back to English, then any locale, for names.
    "locale": "fr-fr,en-us,*",
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


# Genre names that mean "a concert" whatever the segment (segment "Undefined" happens).
MUSIC_GENRES = {
    "rock", "pop", "pop/rock", "hip-hop/rap", "hip hop", "rap", "r&b", "jazz", "blues", "classical",
    "classique", "metal", "hard rock", "electronic", "dance/electronic", "electro", "world",
    "musiques du monde", "chanson française", "chanson francaise", "variété", "variete",
    "variété française", "folk", "reggae", "soul", "funk", "alternative", "country", "latin",
    "gospel", "musique classique", "opéra", "opera", "punk", "indie", "new age",
}

# Last resort when neither the classification nor the title says anything: the kind of
# venue ("Église de la Madeleine" sells concerts, "Le Point Virgule" sells stand-up).
VENUE_CATEGORY_HINTS = [
    (re.compile(r"\b([eé]glise|cath[eé]drale|basilique|chapelle|temple|philharmonie|salle pleyel|"
                r"salle gaveau|olympia|bataclan|z[eé]nith|cigale|trianon|[eé]lys[eé]e montmartre|"
                r"accor arena|seine musicale|maroquinerie|new morning|cabaret sauvage|boule noire|"
                r"fl[eè]che d.or|alhambra|casino de paris|folies berg[eè]re|d[eé]fense arena)\b", re.I),
     "concerts"),
    (re.compile(r"\b(point virgule|comedy|com[eé]die club|caf[eé][ -]th[eé][aâ]tre|caf[eé] de la gare|"
                r"palais des glaces|spotlight|th[eé][aâ]tre de dix heures|apollo|barbizon)\b", re.I),
     "spectacles"),
    (re.compile(r"\b(th[eé][aâ]tre|theater|theatre|com[eé]die|bouffes|op[eé]ra comique|"
                r"la scala|sc[eè]ne)\b", re.I), "theatre"),
]


def venue_category_hint(venue_name: Optional[str]) -> Optional[str]:
    for rx, slug in VENUE_CATEGORY_HINTS:
        if venue_name and rx.search(venue_name):
            return slug
    return None


def display_title(name: str, attractions: List[str], venue_name: Optional[str]) -> str:
    """A 1-3 character name ("ELI") says nothing: use the attraction's longer name, or
    append the venue ("ELI · La Cigale")."""
    t = (name or "").strip()
    if len(t) > 3:
        return t
    for a in attractions:
        if a and len(a.strip()) > 3 and a.strip().lower() != t.lower():
            return a.strip()
    return f"{t} · {venue_name}" if venue_name else t


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
        return "concerts", False  # genre "Undefined" included
    if genre in MUSIC_GENRES:
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
    category, skip = category_for(e.get("classifications") or [
        c for a in (e.get("_embedded") or {}).get("attractions") or [] for c in (a.get("classifications") or [])])
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
    # Genre of the event, else of its artists (some FR listings only classify the attraction).
    attraction_cls = [c for a in (e.get("_embedded") or {}).get("attractions") or []
                      for c in (a.get("classifications") or [])]
    for c in (e.get("classifications") or []) + attraction_cls:
        for k in ("segment", "genre", "subGenre"):
            n = ((c or {}).get(k) or {}).get("name")
            if n and n.lower() != "undefined" and n not in genre_tags:
                genre_tags.append(n)
    attractions = [a.get("name") for a in (e.get("_embedded") or {}).get("attractions") or [] if a.get("name")]
    ev = make_event(
        source=SOURCE,
        source_id=f"tm-{e['id']}",
        title=display_title(e["name"], attractions, v.get("name")),
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
    if not ev["category_slug"]:
        ev["category_slug"] = venue_category_hint(v.get("name"))
    return ev


def parse_api(data) -> Tuple[List[dict], dict]:
    """One Discovery API response → (events, page info)."""
    if not isinstance(data, dict):
        return [], {}
    out = []
    for e in (data.get("_embedded") or {}).get("events") or []:
        if not STATS["diag_printed"] and isinstance(e, dict):
            STATS["diag_printed"] += 1
            a0 = ((e.get("_embedded") or {}).get("attractions") or [{}])[0]
            print(f"  [{SOURCE}] diag event keys={sorted(e)[:25]} classifications={str(e.get('classifications'))[:300]}"
                  f" attraction_cls={str(a0.get('classifications'))[:300]}")
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
    event. Same title + same venue with SERIES_MIN+ sessions → one event spanning them
    (shared rule: utils/series.py; "tm-series-…" ids kept for stability)."""
    return shared_collapse_series(events, SOURCE, id_prefix="tm", min_sessions=SERIES_MIN)


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
