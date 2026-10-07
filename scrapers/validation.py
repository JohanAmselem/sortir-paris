"""
Data contract + quality gate between spiders and the database.

validate(event) -> (event_in, hard_reasons, soft_reasons, score)

- hard reasons  → the event is never published (status 'rejected', or 'cancelled')
- soft reasons  → score penalties; published ('active') iff no hard reason and score ≥ 50
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from pydantic import BaseModel, Field, field_validator

from utils.normalize import IDF_DEPARTMENTS, VALID_CATEGORIES, in_idf

PUBLISH_THRESHOLD = 50
MAX_PRICE_CENTIMES = 50_000  # 500 €
MAX_AHEAD = timedelta(days=548)  # ~18 months
MAX_SPAN = timedelta(days=400)

SOFT_PENALTIES = {
    "no_image": 20,
    "short_description": 15,
    "time_unknown": 10,
    "price_unknown": 10,
    "venue_not_geocoded": 15,
    "no_category": 10,
    "no_venue": 15,
}

_JUNK_TITLE_RE = re.compile(
    r"^(untitled|sans titre|test|tbd|tba|null|none|undefined|evenement|événement|event|"
    r"concert|spectacle|exposition|soirée|soiree|séance|seance|[\W\d_]+)$",
    re.I,
)


class EventIn(BaseModel):
    """The spider → ingest contract (see utils/event.py:make_event)."""

    source: str
    source_id: str
    title: str = ""
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    time_known: bool = True
    description: Optional[str] = None
    short_desc: Optional[str] = None
    image_url: Optional[str] = None
    price_min: int = 0
    price_max: int = 0
    is_free: bool = False
    price_status: str = "unknown"
    booking_url: Optional[str] = None
    source_url: Optional[str] = None
    venue_name: Optional[str] = None
    venue_address: Optional[str] = None
    venue_city: Optional[str] = None
    venue_zip: Optional[str] = None
    venue_lat: Optional[float] = None
    venue_lng: Optional[float] = None
    venue_website: Optional[str] = None
    category_slug: Optional[str] = None
    tags_raw: List[str] = Field(default_factory=list)
    slug: str = ""
    event_status: str = "scheduled"
    is_online: bool = False

    @field_validator("price_min", "price_max", mode="before")
    @classmethod
    def _int_price(cls, v):
        if v is None or v == "":
            return 0
        return int(round(float(v)))

    @field_validator("price_status", mode="before")
    @classmethod
    def _price_status(cls, v):
        return v if v in ("free", "paid", "unknown") else "unknown"

    @field_validator("start_date", "end_date", mode="after")
    @classmethod
    def _aware(cls, v):
        if v is not None and v.tzinfo is None:
            # Contract violation: naive → Paris local (never UTC)
            from utils.dates import to_utc_paris

            return to_utc_paris(v)
        return v

    @field_validator("venue_zip", mode="before")
    @classmethod
    def _zip(cls, v):
        if v is None:
            return None
        v = str(v).strip()
        return v or None

    @field_validator("tags_raw", mode="before")
    @classmethod
    def _tags(cls, v):
        return [str(x) for x in (v or []) if x]


def _score(soft: List[str]) -> int:
    return max(0, 100 - sum(SOFT_PENALTIES.get(r, 5) for r in soft))


def validate(
    event: dict,
    *,
    now: Optional[datetime] = None,
    venue_geocoded: Optional[bool] = None,
) -> Tuple[Optional[EventIn], List[str], List[str], int]:
    """Validate a spider event dict.

    venue_geocoded: pass the DB knowledge (venue has lat/lng); defaults to the
    presence of coordinates on the event itself.
    """
    now = now or datetime.now(timezone.utc)
    hard: List[str] = []
    soft: List[str] = []
    try:
        ev = EventIn.model_validate({k: v for k, v in event.items() if k in EventIn.model_fields})
    except Exception as e:  # malformed dict: reject, never crash the pipeline
        return None, [f"invalid:{type(e).__name__}"], [], 0

    title = (ev.title or "").strip()
    if not title:
        hard.append("no_title")
    elif len(title) < 3 or _JUNK_TITLE_RE.match(title):
        hard.append("junk_title")

    if ev.start_date is None:
        hard.append("no_start_date")
    else:
        end_or_start = ev.end_date or (ev.start_date + timedelta(hours=3))
        if end_or_start < now - timedelta(hours=6):
            hard.append("ended")
        if ev.start_date > now + MAX_AHEAD:
            hard.append("too_far_ahead")
        if ev.end_date is not None:
            if ev.end_date < ev.start_date:
                hard.append("end_before_start")
            elif ev.end_date - ev.start_date > MAX_SPAN:
                hard.append("span_too_long")

    if ev.price_max > MAX_PRICE_CENTIMES or ev.price_min > MAX_PRICE_CENTIMES:
        hard.append("price_outlier")
    if ev.price_min < 0 or (ev.price_max and ev.price_min > ev.price_max):
        hard.append("price_inconsistent")
    if ev.is_free and (ev.price_min > 0 or ev.price_max > 0):
        hard.append("free_with_price")

    # Geography: Île-de-France only
    if ev.venue_lat is not None and ev.venue_lng is not None and not in_idf(ev.venue_lat, ev.venue_lng):
        hard.append("out_of_zone")
    if ev.venue_zip:
        if re.fullmatch(r"\d{5}", ev.venue_zip) and ev.venue_zip[:2] not in IDF_DEPARTMENTS:
            hard.append("out_of_zone")
    if ev.is_online:
        hard.append("online")
    if ev.event_status == "cancelled":
        hard.append("cancelled")

    if ev.category_slug is not None and ev.category_slug not in VALID_CATEGORIES:
        ev.category_slug = None
    hard = list(dict.fromkeys(hard))

    # Soft penalties
    if not ev.image_url:
        soft.append("no_image")
    if not ev.description or len(ev.description) < 80:
        soft.append("short_description")
    if not ev.time_known:
        soft.append("time_unknown")
    if ev.price_status == "unknown":
        soft.append("price_unknown")
    if not ev.venue_name:
        soft.append("no_venue")
    geocoded = venue_geocoded if venue_geocoded is not None else (
        ev.venue_lat is not None and ev.venue_lng is not None
    )
    if ev.venue_name and not geocoded:
        soft.append("venue_not_geocoded")
    if ev.category_slug is None:
        soft.append("no_category")

    return ev, hard, soft, _score(soft)


def decide_status(hard: List[str], score: int) -> str:
    if "cancelled" in hard:
        return "cancelled"
    if hard:
        return "rejected"
    return "active" if score >= PUBLISH_THRESHOLD else "draft"
