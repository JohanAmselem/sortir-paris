"""
Single builder for the event dict every spider yields (the spider → ingest contract).

Keys produced (all spiders must go through make_event):
  source, source_id, source_url, title, description, short_desc, image_url,
  start_date, end_date (ISO-8601 UTC strings), time_known,
  price_min, price_max (centimes), is_free, price_status ('free'|'paid'|'unknown'),
  booking_url, venue_name, venue_address, venue_city, venue_zip, venue_lat, venue_lng,
  venue_website, venue_arrondissement, category_slug, tags_raw, slug,
  event_status ('scheduled'|'cancelled'), is_online, quality_score (legacy hint).

Validation (scrapers/validation.py) decides what is published; spiders must never
invent a date, a time or a price: pass None and let the builder flag it unknown.
"""

from __future__ import annotations

import hashlib
from typing import Iterable, Optional, Union

from utils.dates import FrDate, normalize_when
from utils.normalize import (
    UNKNOWN_PRICE,
    arrondissement_from_zip,
    clean_text,
    compute_quality_score,
    detect_category,
    generate_slug,
    looks_online,
    parse_price_fr,
    truncate,
)


def stable_id(*parts) -> str:
    """Deterministic short id from parts (for sources without their own id)."""
    raw = "|".join(str(p or "") for p in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _to_float(v) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f else None  # NaN guard


def make_event(
    *,
    source: str,
    source_id: Optional[str],
    title: Optional[str],
    start=None,
    end=None,
    when: Optional[FrDate] = None,
    time_known: Optional[bool] = None,
    midnight_unknown: bool = False,
    description: Optional[str] = None,
    short_desc: Optional[str] = None,
    image_url: Optional[str] = None,
    price: Optional[dict] = None,
    price_raw: Optional[str] = None,
    booking_url: Optional[str] = None,
    source_url: Optional[str] = None,
    venue_name: Optional[str] = None,
    venue_address: Optional[str] = None,
    venue_city: Optional[str] = None,
    venue_zip: Optional[str] = None,
    venue_lat=None,
    venue_lng=None,
    venue_website: Optional[str] = None,
    category_slug: Optional[str] = None,
    category_raw: Optional[str] = None,
    category_map: Optional[dict] = None,
    tags: Optional[Iterable[str]] = None,
    event_status: str = "scheduled",
    is_online: Optional[bool] = None,
) -> dict:
    title_c = clean_text(title) or ""
    desc_c = clean_text(description)
    short_c = clean_text(short_desc)

    # ── dates ──
    if when is not None:
        f = when.to_fields()
        start_iso, end_iso, tk = f["start_date"], f["end_date"], f["time_known"]
    else:
        start_iso, tk = normalize_when(start, midnight_unknown=midnight_unknown)
        end_iso, _ = normalize_when(end, is_end=True, midnight_unknown=midnight_unknown)
    if time_known is not None:
        tk = tk and time_known

    # ── price ──
    if price is None:
        price = parse_price_fr(price_raw) if price_raw else dict(UNKNOWN_PRICE)

    # ── category ──
    if not category_slug:
        category_slug = detect_category(category_raw, title_c, desc_c, source_map=category_map)

    venue_zip = (str(venue_zip).strip() or None) if venue_zip else None
    venue_name_c = clean_text(venue_name)
    if is_online is None:
        is_online = looks_online(venue_name_c, venue_address) if venue_name_c or venue_address else False

    sid = str(source_id) if source_id not in (None, "") else stable_id(source, title_c, start_iso, venue_name_c)

    return {
        "source": source,
        "source_id": sid[:255],
        "source_url": source_url,
        "title": title_c[:300],
        "description": desc_c,
        "short_desc": truncate(short_c or desc_c),
        "image_url": image_url or None,
        "start_date": start_iso,
        "end_date": end_iso,
        "time_known": bool(tk) if start_iso else False,
        "price_min": int(price.get("price_min") or 0),
        "price_max": int(price.get("price_max") or 0),
        "is_free": bool(price.get("is_free")),
        "price_status": price.get("price_status") or "unknown",
        "booking_url": booking_url or source_url,
        "venue_name": venue_name_c,
        "venue_address": clean_text(venue_address),
        "venue_city": clean_text(venue_city),
        "venue_zip": venue_zip,
        "venue_lat": _to_float(venue_lat),
        "venue_lng": _to_float(venue_lng),
        "venue_website": venue_website,
        "venue_arrondissement": arrondissement_from_zip(venue_zip),
        "category_slug": category_slug,
        "tags_raw": [t for t in (clean_text(x) for x in (tags or [])) if t][:20],
        "slug": generate_slug(title_c, start_iso),
        "event_status": event_status,
        "is_online": bool(is_online),
        "quality_score": compute_quality_score(
            title_c, desc_c, image_url, start_iso,
            None if (price.get("price_status") == "unknown") else "x", booking_url or source_url,
        ),
    }
