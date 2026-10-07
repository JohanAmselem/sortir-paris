"""
Meetup spider — community cultural events in Paris.
Source: https://www.meetup.com/find/?location=fr--Paris&source=EVENTS&...

Legal basis: public structured data embedded in the public "find" page
(__NEXT_DATA__ → props.pageProps.__APOLLO_STATE__, server-rendered for every visitor).
The search is geo-bounded by Meetup itself (radius 16 km around Paris).

Rules:
- online events (eventType ONLINE / venue "Online event") are dropped; events without
  any venue are dropped (no location).
- price: only when Meetup provides feeSettings (amount + EUR); otherwise UNKNOWN, never free.
- off-topic business/tech/career events are dropped (eventbrite_paris.is_off_topic).
- only the first SSR page (~10–20 events) per query is available without the GraphQL API.
"""

from __future__ import annotations

import json
import re
from typing import Generator, List, Optional

from spiders.eventbrite_paris import is_off_topic
from utils.event import make_event
from utils.http import BudgetExceeded, PoliteClient
from utils.normalize import IDF_DEPARTMENTS, UNKNOWN_PRICE, extract_zip, looks_online, price_from_numbers

SOURCE = "meetup"
FIND_URL = "https://www.meetup.com/find/?location=fr--Paris&source=EVENTS&distance=tenMiles"

# (query string, require_category). categoryId=521 is "Art & Culture" (verified
# 2026-10-07; 546 is Technology). Keyword searches also return unrelated meetups
# (afterworks…), so their events are kept only if detect_category finds a category.
QUERIES = [
    ("categoryId=521", False),
    ("keywords=concert", True),
    ("keywords=th%C3%A9%C3%A2tre", True),
    ("keywords=exposition", True),
    ("keywords=visite%20guid%C3%A9e", True),
]

_NEXT_RE = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)


def _apollo(html: str) -> dict:
    m = _NEXT_RE.search(html or "")
    if not m:
        return {}
    try:
        data = json.loads(m.group(1))
    except ValueError:
        return {}
    return ((data.get("props") or {}).get("pageProps") or {}).get("__APOLLO_STATE__") or {}


def _deref(apollo: dict, v):
    if isinstance(v, dict) and "__ref" in v:
        return apollo.get(v["__ref"]) or {}
    return v or {}


def _price(fee) -> dict:
    if isinstance(fee, dict) and (fee.get("currency") or "").upper() == "EUR" and fee.get("amount") is not None:
        return price_from_numbers(fee.get("amount"))
    return dict(UNKNOWN_PRICE)


def event_from_apollo(e: dict, apollo: dict, category_slug: Optional[str] = None) -> Optional[dict]:
    title = e.get("title")
    if not title or not e.get("dateTime"):
        return None
    venue = e.get("venue") or {}
    if (e.get("eventType") or "").upper() == "ONLINE" or e.get("isOnline"):
        return None
    if not venue or looks_online(venue.get("name")):
        return None
    if venue.get("country") and venue["country"].lower() != "fr":
        return None
    zip_code = extract_zip(venue.get("address"))
    if zip_code and zip_code[:2] not in IDF_DEPARTMENTS:
        return None
    if not (venue.get("city") or zip_code):
        return None
    desc = e.get("description")
    if is_off_topic(title, desc):
        return None

    group = _deref(apollo, e.get("group"))
    photo = _deref(apollo, e.get("featuredEventPhoto") or e.get("displayPhoto"))
    url = e.get("eventUrl")
    return make_event(
        source=SOURCE,
        source_id=f"meetup-{e['id']}" if e.get("id") else None,
        title=title,
        start=e.get("dateTime"),
        end=e.get("endTime"),
        description=desc,
        image_url=photo.get("highResUrl") if isinstance(photo, dict) else None,
        price=_price(e.get("feeSettings")),
        booking_url=url,
        source_url=url,
        venue_name=venue.get("name"),
        venue_address=venue.get("address"),
        venue_city=venue.get("city"),
        venue_zip=zip_code,
        category_slug=category_slug,
        tags=["meetup"] + ([group["name"]] if isinstance(group, dict) and group.get("name") else []),
        event_status="cancelled" if (e.get("status") or "").upper() == "CANCELLED" else "scheduled",
        is_online=False,
    )


def parse_find_page(html: str, require_category: bool = False) -> List[dict]:
    apollo = _apollo(html)
    out = []
    for key, val in apollo.items():
        if not key.startswith("Event:") or not isinstance(val, dict):
            continue
        try:
            ev = event_from_apollo(val, apollo)
        except Exception as ex:
            print(f"  [{SOURCE}] bad event {key}: {ex}")
            continue
        if ev and (ev["category_slug"] or not require_category):
            out.append(ev)
    return out


def fetch_events(max_pages: int = 5) -> Generator[dict, None, None]:
    """One SSR find page per query (max_pages = number of queries used)."""
    seen: set = set()
    with PoliteClient(delay=2.0) as client:
        for i, (query, require_category) in enumerate(QUERIES[:max_pages]):
            url = f"{FIND_URL}&{query}"
            try:
                html = client.get_text(url)
            except BudgetExceeded:
                raise
            if html is None:
                if i == 0:
                    print(f"  [{SOURCE}] blocked: {url} unreachable")
                    return
                continue
            if not _apollo(html):
                print(f"  [{SOURCE}] no __APOLLO_STATE__ on {url} — page structure changed")
                if i == 0:
                    return
                continue
            evs = [e for e in parse_find_page(html, require_category) if e["source_id"] not in seen]
            for ev in evs:
                seen.add(ev["source_id"])
                yield ev
            print(f"  [{SOURCE}] {query}: {len(evs)} kept")
