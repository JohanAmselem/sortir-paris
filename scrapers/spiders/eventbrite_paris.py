"""
Eventbrite Paris spider.
Source: https://www.eventbrite.fr/d/france--paris/<category>--events/

Legal basis: public structured data embedded in the public listing pages
(window.__SERVER_DATA__ JSON + schema.org JSON-LD) and schema.org JSON-LD on event
pages (prices: AggregateOffer lowPrice/highPrice).

Filters (pure functions, tested):
- geography: Île-de-France only — venue lat/lng in the IDF bbox, else postcode prefix
  75/77/78/91/92/93/94/95; events with no location at all are dropped; online → dropped.
- off-topic: is_off_topic(title, desc) drops business/career/finance events.
Dates: start_date + start_time are local to the event timezone (Europe/Paris);
no time (or hide_start_date) → time unknown, never midnight UTC.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime
from typing import Generator, List, Optional
from zoneinfo import ZoneInfo

from unidecode import unidecode

from utils.dates import PARIS
from utils.event import make_event
from utils.http import BudgetExceeded, PoliteClient
from utils.jsonld import event_from_jsonld, extract_jsonld, iter_events
from utils.normalize import (
    IDF_DEPARTMENTS,
    UNKNOWN_PRICE,
    extract_zip,
    in_idf,
    price_from_numbers,
    price_from_offers,
)

SOURCE = "eventbrite"
BASE_URL = "https://www.eventbrite.fr"

# (listing path, explicit category or None = detect from Eventbrite format/title)
LISTINGS = [
    ("/d/france--paris/music--events/", "concerts"),
    ("/d/france--paris/performing-arts--events/", None),
    ("/d/france--paris/arts--events/", None),
    ("/d/france--paris/film-and-media--events/", "cinema"),
    ("/d/france--paris/nightlife--events/", None),
]

# Eventbrite "format" tag → our category (overrides the listing category)
FORMAT_MAP = {
    "screening": "cinema",
    "class, training, or workshop": "ateliers",
    "conference": "conferences",
    "seminar or talk": "conferences",
    "festival or fair": "festivals",
    "tour": "visites",
}

# ───────────────────────────── filters ─────────────────────────────

_OFF_TOPIC_RE = re.compile(
    r"\b("
    r"career fair|job fair|job dating|jobdating|salon de l.?emploi|forum (?:de l.?)?emploi|"
    r"recrutement|recruitment|recruiting|hiring|"
    r"networking|business|entrepreneur\w*|investor\w*|investisseur\w*|startup pitch|pitch night|"
    r"webinar|webinaire|formation certifiante|certification|masterclass business|"
    r"crypto\w*|bitcoin|ethereum|web3|blockchain|nft|trading|forex|"
    r"immobilier|real estate|leadership|marketing digital|growth hacking|"
    r"speed.?dating"
    r")\b"
)


def is_off_topic(title: Optional[str], desc: Optional[str] = None) -> bool:
    """True for business / career / finance events that are not cultural outings."""
    text = unidecode(f"{title or ''} {desc or ''}").lower()
    return bool(_OFF_TOPIC_RE.search(text))


def in_paris_region(lat=None, lng=None, zip_code: Optional[str] = None) -> bool:
    """IDF check: geo first (when present), else postcode prefix. No location → False."""
    try:
        has_geo = lat not in (None, "") and lng not in (None, "") and float(lat) and float(lng)
    except (TypeError, ValueError):
        has_geo = False
    if has_geo:
        return in_idf(lat, lng)
    z = str(zip_code or "").strip()
    return bool(re.match(r"^\d{5}$", z)) and z[:2] in IDF_DEPARTMENTS


# ───────────────────────────── parsing ─────────────────────────────

_SERVER_DATA_RE = re.compile(r"window\.__SERVER_DATA__\s*=\s*(\{.*?\});\s*\n", re.S)


def _server_data(html: str) -> Optional[dict]:
    m = _SERVER_DATA_RE.search(html or "")
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except ValueError:
        return None


def _local(d: Optional[str], t: Optional[str], tz: Optional[str]):
    """Eventbrite local date + optional HH:MM in the event timezone → datetime/date."""
    if not d:
        return None
    try:
        day = date.fromisoformat(d)
    except ValueError:
        return None
    if not t:
        return day
    try:
        hh, mm = (int(x) for x in t.split(":")[:2])
        zone = ZoneInfo(tz) if tz else PARIS
    except Exception:
        return day
    return datetime(day.year, day.month, day.day, hh, mm, tzinfo=zone)


def _tags(result: dict) -> dict:
    out = {"category": None, "subcategory": None, "format": None, "organizer": []}
    for t in result.get("tags") or []:
        prefix, name = t.get("prefix"), t.get("display_name")
        if prefix == "EventbriteCategory":
            out["category"] = name
        elif prefix == "EventbriteSubCategory":
            out["subcategory"] = name
        elif prefix == "EventbriteFormat":
            out["format"] = name
        elif prefix == "OrganizerTag" and name:
            out["organizer"].append(name)
    return out


def _ticket_price(result: dict) -> dict:
    ta = result.get("ticket_availability") or {}
    if not isinstance(ta, dict) or not ta:
        return dict(UNKNOWN_PRICE)
    lo, hi = ta.get("minimum_ticket_price") or {}, ta.get("maximum_ticket_price") or {}
    if (lo.get("currency") or "EUR") != "EUR":
        return dict(UNKNOWN_PRICE)
    if ta.get("is_free") is True:
        return price_from_numbers(0)
    return price_from_numbers(lo.get("major_value"), hi.get("major_value"))


def event_from_result(result: dict, category_slug: Optional[str] = None) -> Optional[dict]:
    """One __SERVER_DATA__ search result → event dict, or None if filtered out."""
    title = result.get("name")
    if not title or result.get("is_online_event"):
        return None
    desc = result.get("summary") or result.get("full_description")
    if is_off_topic(title, desc):
        return None

    venue = result.get("primary_venue") or {}
    addr = venue.get("address") or {}
    lat, lng = addr.get("latitude"), addr.get("longitude")
    zip_code = addr.get("postal_code") or extract_zip(addr.get("localized_address_display"))
    if not in_paris_region(lat, lng, zip_code):
        return None

    tz = result.get("timezone") or "Europe/Paris"
    start = None if result.get("hide_start_date") else _local(result.get("start_date"), result.get("start_time"), tz)
    if start is None:
        return None
    end = None if result.get("hide_end_date") else _local(result.get("end_date"), result.get("end_time"), tz)

    tags = _tags(result)
    cat = FORMAT_MAP.get((tags["format"] or "").lower()) or category_slug
    image = (result.get("image") or {})
    image_url = (image.get("original") or {}).get("url") or image.get("url")
    eid = result.get("eventbrite_event_id") or result.get("id")
    url = result.get("url")

    return make_event(
        source=SOURCE,
        source_id=f"eb-{eid}" if eid else None,
        title=title,
        start=start,
        end=end,
        description=desc,
        image_url=image_url,
        price=_ticket_price(result),
        booking_url=url,
        source_url=url,
        venue_name=venue.get("name"),
        venue_address=addr.get("address_1"),
        venue_city=addr.get("city"),
        venue_zip=zip_code,
        venue_lat=lat,
        venue_lng=lng,
        category_slug=cat,
        category_raw=tags["subcategory"] or tags["category"],
        tags=[x for x in (tags["category"], tags["subcategory"], tags["format"]) if x] + tags["organizer"][:5],
        event_status="cancelled" if result.get("is_cancelled") else "scheduled",
        is_online=False,
    )


def _jsonld_fallback(html: str, category_slug: Optional[str]) -> List[dict]:
    out = []
    for obj in iter_events(extract_jsonld(html)):
        if is_off_topic(obj.get("name"), obj.get("description")):
            continue
        ev = event_from_jsonld(obj, source=SOURCE, base_url=BASE_URL, category_slug=category_slug)
        if not ev or ev["is_online"]:
            continue
        if not in_paris_region(ev["venue_lat"], ev["venue_lng"], ev["venue_zip"]):
            continue
        m = re.search(r"-(\d{6,})(?:[/?]|$)", ev["source_url"] or "")
        if m:
            ev["source_id"] = f"eb-{m.group(1)}"
        out.append(ev)
    return out


def parse_listing(html: str, category_slug: Optional[str] = None) -> List[dict]:
    """Listing page → filtered event dicts (deduplicated by Eventbrite id)."""
    data = _server_data(html)
    results: List[dict] = []
    if data:
        for block in (data.get("event_data") or {}).values():
            if isinstance(block, dict):
                results.extend(((block.get("events") or {}).get("results")) or [])
    if not results:
        return _jsonld_fallback(html, category_slug)
    out, seen = [], set()
    for r in results:
        if not isinstance(r, dict):
            continue
        eid = r.get("eventbrite_event_id") or r.get("id")
        if eid in seen:
            continue
        seen.add(eid)
        try:
            ev = event_from_result(r, category_slug)
        except Exception as e:
            print(f"  [{SOURCE}] bad result {eid}: {e}")
            continue
        if ev:
            out.append(ev)
    return out


def has_next_page(html: str) -> bool:
    data = _server_data(html) or {}
    for block in (data.get("event_data") or {}).values():
        pag = ((block or {}).get("events") or {}).get("pagination") or {}
        if pag.get("continuation"):
            return True
    return bool(data.get("rel_next_cat_browse"))


def parse_detail(html: str) -> dict:
    """Event page JSON-LD → {'price': dict, 'start': str|None, 'end': str|None, 'cancelled': bool}."""
    for obj in iter_events(extract_jsonld(html)):
        return {
            "price": price_from_offers(obj.get("offers")),
            "start": obj.get("startDate"),
            "end": obj.get("endDate"),
            "cancelled": "cancel" in str(obj.get("eventStatus") or "").lower(),
        }
    return {"price": dict(UNKNOWN_PRICE), "start": None, "end": None, "cancelled": False}


def apply_detail(ev: dict, info: dict) -> dict:
    """Merge the event page's price/status (and exact start with offset) into a listing event."""
    if ev["price_status"] == "unknown" and info["price"]["price_status"] != "unknown":
        ev.update({k: info["price"][k] for k in ("price_min", "price_max", "is_free", "price_status")})
    if info["cancelled"]:
        ev["event_status"] = "cancelled"
    if info["start"] and not ev["time_known"]:
        from utils.dates import normalize_when

        iso, tk = normalize_when(info["start"])
        if iso and tk:
            ev["start_date"], ev["time_known"] = iso, True
    return ev


# ───────────────────────────── network ─────────────────────────────

def fetch_events(max_pages: int = 5, fetch_details: bool = True, max_details: int = 200) -> Generator[dict, None, None]:
    """Listing pages (8–20 events each) + event pages for prices (bounded by max_details)."""
    seen: set = set()
    details = 0
    with PoliteClient() as client:
        for path, category in LISTINGS:
            for page in range(1, max_pages + 1):
                url = f"{BASE_URL}{path}" + (f"?page={page}" if page > 1 else "")
                html = client.get_text(url)
                if html is None:
                    if not seen and path == LISTINGS[0][0] and page == 1:
                        print(f"  [{SOURCE}] blocked: {url} unreachable")
                        return
                    break
                evs = parse_listing(html, category)
                new = [e for e in evs if e["source_id"] not in seen]
                for ev in new:
                    seen.add(ev["source_id"])
                    if fetch_details and details < max_details and ev["source_url"]:
                        details += 1
                        try:
                            detail = client.get_text(ev["source_url"])
                            if detail:
                                apply_detail(ev, parse_detail(detail))
                        except BudgetExceeded:
                            raise
                        except Exception as e:
                            print(f"  [{SOURCE}] detail failed {ev['source_url']}: {e}")
                    yield ev
                print(f"  [{SOURCE}] {path} page {page}: {len(new)} kept")
                if not has_next_page(html):
                    break
