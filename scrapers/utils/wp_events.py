"""
WordPress event-plugin APIs → event dicts (via make_event).

Supported (all public, read-only, published by the plugins for machines):

- The Events Calendar (StellarWP / "Tribe"): REST API
    GET {root}/wp-json/tribe/events/v1/events?start_date=now&per_page=50
    → {"events": [...], "total": N, "total_pages": P, "next_rest_url": "..."}
  Each event: id, url, title (HTML-escaped), description (HTML), start_date / end_date
  (site-local "YYYY-MM-DD HH:MM:SS"), utc_start_date / utc_end_date, timezone, all_day,
  cost, cost_details {currency_code, values[]}, venue {venue, address, city, zip,
  geo_lat, geo_lng} (or [] when none), image {url} (or false), categories [{name}], tags.
  When pretty permalinks are off the same API lives at /?rest_route=/tribe/events/v1/events.
- Events Manager and Modern Events Calendar publish iCal feeds (utils/ics.py) and
  schema.org JSON-LD (utils/jsonld.py); only the URLs are defined here.

Rules (scrapers/utils/event.py): never invent a date, a time, a price or a place.
"""

from __future__ import annotations

import html
import re
from typing import Iterator, List, Optional, Tuple
from urllib.parse import urlencode, urlparse

from utils.event import make_event
from utils.normalize import (
    FREE_PRICE, UNKNOWN_PRICE, clean_text, parse_price_fr, price_from_numbers,
)

TRIBE_PATH = "/wp-json/tribe/events/v1/events"
TRIBE_ROUTE = "/tribe/events/v1/events"
EM_ICS_PATH = "/events.ics"                # Events Manager iCal feed
MEC_ICS_QUERY = "?mec-ical-feed=1"         # Modern Events Calendar iCal feed (when enabled)

_DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}")
_FREE_WORDS = re.compile(r"\b(gratuit\w*|entr[ée]e libre|acc[èe]s libre|free)\b", re.I)


def site_root(url: str) -> str:
    p = urlparse(url)
    return f"{p.scheme}://{p.netloc}"


def tribe_url(root_or_url: str, *, per_page: int = 50, start_date: str = "now",
              plain_permalinks: bool = False) -> str:
    """First page of the Tribe REST listing for a site (root URL or any URL of the site)."""
    root = site_root(root_or_url)
    params = {"start_date": start_date, "per_page": per_page}
    if plain_permalinks:
        return f"{root}/?{urlencode({'rest_route': TRIBE_ROUTE, **params})}"
    return f"{root}{TRIBE_PATH}?{urlencode(params)}"


def is_tribe_payload(data) -> bool:
    return isinstance(data, dict) and isinstance(data.get("events"), list) and (
        "total" in data or "rest_url" in data or not data["events"]
        or isinstance(data["events"][0], dict) and "start_date" in data["events"][0]
    )


def tribe_next_url(data) -> Optional[str]:
    if not isinstance(data, dict):
        return None
    nxt = data.get("next_rest_url")
    return nxt if isinstance(nxt, str) and nxt.startswith("http") else None


# ─────────────────────────────── field helpers ───────────────────────────────

def _txt(v) -> Optional[str]:
    if not isinstance(v, str):
        return None
    return clean_text(html.unescape(v))


def tribe_dates(ev: dict) -> Tuple[Optional[str], Optional[str], bool]:
    """(start, end, time_known) as ISO strings understood by make_event.

    Timed events use utc_* (exact instant). All-day events are dates only: the
    plugin stores them as 00:00:00 → 23:59:59 local, which is not a real time.
    """
    all_day = bool(ev.get("all_day"))
    start_local = ev.get("start_date") if isinstance(ev.get("start_date"), str) else None
    end_local = ev.get("end_date") if isinstance(ev.get("end_date"), str) else None
    if all_day:
        s = start_local[:10] if start_local and _DATE_ONLY.match(start_local) else None
        e = end_local[:10] if end_local and _DATE_ONLY.match(end_local) else None
        return s, (e if e and e != s else None), False

    def utc(key_utc, local):
        v = ev.get(key_utc)
        if isinstance(v, str) and re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}", v):
            return v.replace(" ", "T") + "+00:00"
        if local and re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}", local):
            tz = ev.get("timezone")
            if tz in (None, "", "Europe/Paris", "UTC+1", "UTC+2"):
                return local.replace(" ", "T")  # naive = Paris local (make_event contract)
            try:
                from datetime import datetime
                from zoneinfo import ZoneInfo

                return datetime.fromisoformat(local).replace(tzinfo=ZoneInfo(tz)).isoformat()
            except Exception:
                return None
        return None

    s = utc("utc_start_date", start_local)
    e = utc("utc_end_date", end_local)
    if e == s:
        e = None
    return s, e, s is not None


def tribe_price(ev: dict) -> dict:
    """cost_details.values (numbers) first, then the free-text cost. Never guessed."""
    cost = ev.get("cost") if isinstance(ev.get("cost"), str) else ""
    details = ev.get("cost_details") if isinstance(ev.get("cost_details"), dict) else {}
    currency = str(details.get("currency_code") or details.get("currency_symbol") or "EUR").upper()
    values = []
    for v in details.get("values") or []:
        try:
            values.append(float(str(v).replace(",", ".")))
        except ValueError:
            continue
    text = clean_text(html.unescape(cost)) or ""
    if values and currency in ("EUR", "€", ""):
        price = price_from_numbers(min(values), max(values))
        if price["price_status"] == "paid" and _FREE_WORDS.search(text):
            price["price_min"] = 0  # "Gratuit – 10 €": free for some, paid for others
            price["is_free"] = False
        return price
    if text:
        return parse_price_fr(text)
    return dict(UNKNOWN_PRICE)


def tribe_venue(ev: dict) -> dict:
    v = ev.get("venue")
    if isinstance(v, list):
        v = next((x for x in v if isinstance(x, dict)), None)
    if not isinstance(v, dict):
        return {}
    zip_code = str(v.get("zip") or "").strip() or None

    def num(x):
        try:
            f = float(x)
        except (TypeError, ValueError):
            return None
        return f if f else None

    return {
        "venue_name": _txt(v.get("venue")),
        "venue_address": _txt(v.get("address")),
        "venue_city": _txt(v.get("city")),
        "venue_zip": zip_code,
        "venue_lat": num(v.get("geo_lat")),
        "venue_lng": num(v.get("geo_lng")),
    }


def _names(items) -> List[str]:
    out = []
    for x in items or []:
        if isinstance(x, dict) and x.get("name"):
            n = _txt(x["name"])
            if n:
                out.append(n)
    return out


# ─────────────────────────────── main parser ───────────────────────────────

def event_from_tribe(
    ev: dict,
    *,
    source: str,
    default_venue: Optional[dict] = None,
    same_place=None,
    category_slug: Optional[str] = None,
    category_map: Optional[dict] = None,
) -> Optional[dict]:
    """One Tribe REST event → event dict, or None (no title / no start date).

    default_venue fills missing venue fields only when the event's own venue is absent
    or is the same place (same_place(event_venue_name, default_name) → bool).
    """
    if not isinstance(ev, dict):
        return None
    title = _txt(ev.get("title"))
    start, end, time_known = tribe_dates(ev)
    if not title or not start:
        return None

    loc = tribe_venue(ev)
    dv = default_venue or {}
    if dv and (not loc.get("venue_name") or same_place is None
               or same_place(loc.get("venue_name"), dv.get("venue_name"))):
        for k in ("venue_name", "venue_address", "venue_city", "venue_zip", "venue_lat", "venue_lng"):
            if not loc.get(k) and dv.get(k) is not None:
                loc[k] = dv[k]

    image = ev.get("image")
    image_url = image.get("url") if isinstance(image, dict) else None
    cats = _names(ev.get("categories"))
    tags = _names(ev.get("tags"))
    url = ev.get("url") if isinstance(ev.get("url"), str) else None
    website = ev.get("website") if isinstance(ev.get("website"), str) and ev.get("website", "").startswith("http") else None
    status = str(ev.get("status") or "").lower()
    title_l = (title or "").lower()
    cancelled = status in ("cancelled", "canceled") or title_l.startswith(("annulé", "annule", "cancelled"))

    return make_event(
        source=source,
        source_id=f"{ev.get('id') or url}#{start}",
        title=title,
        start=start,
        end=end,
        time_known=time_known,
        description=ev.get("description") or ev.get("excerpt"),
        image_url=image_url or None,
        price=tribe_price(ev),
        booking_url=website or url,
        source_url=url,
        venue_name=loc.get("venue_name"),
        venue_address=loc.get("venue_address"),
        venue_city=loc.get("venue_city"),
        venue_zip=loc.get("venue_zip"),
        venue_lat=loc.get("venue_lat"),
        venue_lng=loc.get("venue_lng"),
        category_slug=category_slug,
        category_raw=", ".join(cats) if cats else None,
        category_map=category_map,
        tags=cats + tags,
        event_status="cancelled" if cancelled else "scheduled",
    )


def iter_tribe_events(data) -> Iterator[dict]:
    if is_tribe_payload(data):
        for ev in data["events"]:
            if isinstance(ev, dict) and not ev.get("hide_from_listings"):
                yield ev


def events_from_tribe(data, *, source: str, **kwargs) -> List[dict]:
    out = []
    for raw in iter_tribe_events(data):
        try:
            ev = event_from_tribe(raw, source=source, **kwargs)
        except Exception as e:  # one malformed event never kills the page
            print(f"  [{source}] skipped malformed Tribe event {raw.get('id')}: {e}")
            continue
        if ev:
            out.append(ev)
    return out
