"""
schema.org JSON-LD helpers: extract Event objects from any HTML page and turn them
into our event dict (via make_event). Used by many spiders and by the generic
venue spider (spiders/venues_structured.py).
"""

from __future__ import annotations

import json
import re
from typing import Iterator, List, Optional, Union

from bs4 import BeautifulSoup

from utils.event import make_event
from utils.normalize import absolute_url, clean_text, price_from_offers, FREE_PRICE

EVENT_TYPES = {
    "event", "musicevent", "theaterevent", "screeningevent", "exhibitionevent",
    "danceevent", "comedyevent", "festival", "educationevent", "socialevent",
    "visualartsevent", "childrensevent", "literaryevent", "publicationevent",
    "eventseries", "foodevent", "courseinstance",
}

TYPE_TO_CATEGORY = {
    "musicevent": "concerts",
    "theaterevent": "theatre",
    "screeningevent": "cinema",
    "exhibitionevent": "expos",
    "visualartsevent": "expos",
    "danceevent": "danse",
    "comedyevent": "spectacles",
    "festival": "festivals",
    "educationevent": "ateliers",
    "literaryevent": "conferences",
}


def _types(obj: dict) -> List[str]:
    t = obj.get("@type")
    if isinstance(t, list):
        return [str(x).lower() for x in t]
    return [str(t).lower()] if t else []


def _loads_lenient(raw: str):
    raw = raw.strip()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        pass
    # Common breakages: trailing commas, raw newlines in strings, HTML comments.
    cleaned = re.sub(r"^\s*<!--|-->\s*$", "", raw)
    cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)
    cleaned = cleaned.replace("\n", " ").replace("\r", " ").replace("\t", " ")
    try:
        return json.loads(cleaned)
    except ValueError:
        return None


def extract_jsonld(page: Union[str, BeautifulSoup]) -> List[dict]:
    """All JSON-LD objects in a page, flattened (@graph, lists, ItemList elements)."""
    soup = page if isinstance(page, BeautifulSoup) else BeautifulSoup(page or "", "html.parser")
    out: List[dict] = []

    def walk(node, depth=0):
        if depth > 6 or node is None:
            return
        if isinstance(node, list):
            for x in node:
                walk(x, depth + 1)
            return
        if not isinstance(node, dict):
            return
        out.append(node)
        if "@graph" in node:
            walk(node["@graph"], depth + 1)
        if "itemListElement" in node:
            for el in node.get("itemListElement") or []:
                if isinstance(el, dict) and isinstance(el.get("item"), dict):
                    walk(el["item"], depth + 1)
                else:
                    walk(el, depth + 1)
        for key in ("subEvent", "subEvents", "event", "events"):
            if key in node:
                walk(node[key], depth + 1)

    for script in soup.find_all("script", attrs={"type": re.compile(r"ld\+json", re.I)}):
        data = _loads_lenient(script.string or script.get_text() or "")
        walk(data)
    return out


def iter_events(objs: List[dict]) -> Iterator[dict]:
    seen = set()
    for o in objs:
        if any(t in EVENT_TYPES for t in _types(o)) and o.get("startDate"):
            key = (o.get("name"), o.get("startDate"), o.get("url"))
            if key in seen:
                continue
            seen.add(key)
            yield o


def _first(v):
    if isinstance(v, list):
        return v[0] if v else None
    return v


def image_from(v) -> Optional[str]:
    v = _first(v)
    if isinstance(v, dict):
        v = v.get("url") or v.get("contentUrl") or v.get("@id")
    if isinstance(v, str) and v.strip():
        return v.strip()
    return None


def location_from(loc) -> dict:
    """schema.org Place / VirtualLocation → venue fields."""
    out = {"venue_name": None, "venue_address": None, "venue_city": None, "venue_zip": None,
           "venue_lat": None, "venue_lng": None, "is_online": False}
    if isinstance(loc, list):
        physical = [l for l in loc if isinstance(l, dict) and "virtual" not in " ".join(_types(l))]
        if not physical and loc:
            out["is_online"] = True
            return out
        loc = physical[0] if physical else None
    if isinstance(loc, str):
        out["venue_name"] = clean_text(loc)
        return out
    if not isinstance(loc, dict):
        return out
    if "virtuallocation" in _types(loc):
        out["is_online"] = True
        return out
    out["venue_name"] = clean_text(loc.get("name"))
    addr = loc.get("address")
    if isinstance(addr, list):
        addr = addr[0] if addr else None
    if isinstance(addr, dict):
        out["venue_address"] = clean_text(addr.get("streetAddress"))
        out["venue_city"] = clean_text(addr.get("addressLocality"))
        out["venue_zip"] = clean_text(str(addr.get("postalCode") or "")) or None
    elif isinstance(addr, str):
        out["venue_address"] = clean_text(addr)
    geo = loc.get("geo")
    if isinstance(geo, dict):
        out["venue_lat"] = geo.get("latitude")
        out["venue_lng"] = geo.get("longitude")
    return out


def event_from_jsonld(
    obj: dict,
    *,
    source: str,
    base_url: str = "",
    default_venue: Optional[dict] = None,
    category_slug: Optional[str] = None,
    category_map: Optional[dict] = None,
    source_id: Optional[str] = None,
    midnight_unknown: bool = False,
) -> Optional[dict]:
    """schema.org Event → event dict. Returns None if no name / no startDate."""
    title = clean_text(obj.get("name"))
    start = obj.get("startDate")
    if not title or not start:
        return None
    if isinstance(start, list):
        start = start[0]

    loc = location_from(obj.get("location"))
    dv = default_venue or {}
    for k in ("venue_name", "venue_address", "venue_city", "venue_zip", "venue_lat", "venue_lng"):
        if not loc.get(k) and dv.get(k) is not None:
            loc[k] = dv[k]

    url = obj.get("url")
    if isinstance(url, list):
        url = url[0]
    url = absolute_url(base_url, url) if isinstance(url, str) else None

    offers = obj.get("offers")
    price = price_from_offers(offers)
    if price["price_status"] == "unknown" and obj.get("isAccessibleForFree") in (True, "true", "True"):
        price = dict(FREE_PRICE)

    booking = None
    for o in offers if isinstance(offers, list) else [offers]:
        if isinstance(o, dict) and isinstance(o.get("url"), str):
            booking = absolute_url(base_url, o["url"])
            break

    status = str(obj.get("eventStatus") or "")
    event_status = "cancelled" if "cancel" in status.lower() else "scheduled"
    mode = str(obj.get("eventAttendanceMode") or "").lower()
    is_online = loc["is_online"] or ("online" in mode and "mixed" not in mode)

    if not category_slug:
        for t in _types(obj):
            if t in TYPE_TO_CATEGORY:
                category_slug = TYPE_TO_CATEGORY[t]
                break
    genre = obj.get("genre") or obj.get("keywords")
    if isinstance(genre, list):
        genre = ", ".join(str(g) for g in genre)

    performer = obj.get("performer")
    tags = []
    for p in performer if isinstance(performer, list) else [performer]:
        if isinstance(p, dict) and p.get("name"):
            tags.append(p["name"])

    sid = source_id or url or obj.get("@id")
    image = image_from(obj.get("image"))
    return make_event(
        source=source,
        source_id=f"{sid}#{start}" if sid else None,
        title=title,
        start=start,
        end=obj.get("endDate"),
        midnight_unknown=midnight_unknown,
        description=obj.get("description"),
        image_url=absolute_url(base_url, image) if image else None,
        price=price,
        booking_url=booking or url,
        source_url=url,
        venue_name=loc["venue_name"],
        venue_address=loc["venue_address"],
        venue_city=loc["venue_city"],
        venue_zip=loc["venue_zip"],
        venue_lat=loc["venue_lat"],
        venue_lng=loc["venue_lng"],
        category_slug=category_slug,
        category_raw=genre if isinstance(genre, str) else None,
        category_map=category_map,
        tags=tags,
        event_status=event_status,
        is_online=is_online,
    )


def events_from_html(
    page: Union[str, BeautifulSoup], *, source: str, base_url: str = "", **kwargs
) -> List[dict]:
    out = []
    for obj in iter_events(extract_jsonld(page)):
        ev = event_from_jsonld(obj, source=source, base_url=base_url, **kwargs)
        if ev:
            out.append(ev)
    return out
