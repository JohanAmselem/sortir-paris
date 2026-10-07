"""
Bandsintown spider — concerts.
Source: https://rest.bandsintown.com (official Artist API v3)

Status (2026-10-07): no public city feed.
- bandsintown.com/c/paris-france answers HTTP 403 (Cloudflare challenge) to our bot.
- The official REST API is artist-based only (GET /artists/{name}/events) and needs an
  app_id authorised by Bandsintown: an arbitrary app_id gets HTTP 403 "explicit deny".
  The former "/artists/recommended?location=Paris" endpoint was guessed and does not exist.

So fetch_events yields nothing unless both env vars are set:
  BANDSINTOWN_APP_ID   — an authorised app_id
  BANDSINTOWN_ARTISTS  — comma-separated artist names to follow
Then each artist's upcoming events are fetched and only Île-de-France venues are kept.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Generator, Iterable, List, Optional
from urllib.parse import quote

from utils.event import make_event
from utils.http import BudgetExceeded, PoliteClient
from utils.normalize import extract_zip, in_idf

SOURCE = "bandsintown"
API_BASE = "https://rest.bandsintown.com"


def event_from_api(e: dict, artist: Optional[str] = None) -> Optional[dict]:
    """One official API event (documented shape) → event dict, None outside IDF."""
    venue = e.get("venue") or {}
    lat, lng = venue.get("latitude"), venue.get("longitude")
    if not in_idf(lat, lng):
        return None
    when = e.get("datetime")  # venue-local, no offset (Paris for IDF venues)
    if not when or not e.get("id"):
        return None
    lineup = [x for x in (e.get("lineup") or []) if isinstance(x, str)]
    title = e.get("title") or (", ".join(lineup) if lineup else artist)
    ticket = next((o.get("url") for o in e.get("offers") or [] if isinstance(o, dict) and o.get("url")), None)
    return make_event(
        source=SOURCE,
        source_id=f"bit-{e['id']}",
        title=title,
        start=when,
        end=e.get("ends_at") or None,
        description=e.get("description") or None,
        booking_url=ticket or e.get("url"),
        source_url=e.get("url"),
        venue_name=venue.get("name"),
        venue_address=venue.get("street_address"),
        venue_city=venue.get("city"),
        venue_zip=venue.get("postal_code") or extract_zip(venue.get("location")),
        venue_lat=lat,
        venue_lng=lng,
        category_slug="concerts",
        tags=lineup,
    )


def parse_artist_events(data, artist: Optional[str] = None) -> List[dict]:
    if not isinstance(data, list):
        return []
    out = []
    for e in data:
        if isinstance(e, dict):
            ev = event_from_api(e, artist)
            if ev:
                out.append(ev)
    return out


def fetch_events(
    max_pages: int = 20,
    days_ahead: int = 90,
    artists: Optional[Iterable[str]] = None,
) -> Generator[dict, None, None]:
    app_id = os.environ.get("BANDSINTOWN_APP_ID")
    names = list(artists or [a.strip() for a in os.environ.get("BANDSINTOWN_ARTISTS", "").split(",") if a.strip()])
    if not app_id or not names:
        print(f"  [{SOURCE}] skipped: no public city feed (website 403 Cloudflare; official API is "
              f"artist-based and needs an authorised BANDSINTOWN_APP_ID + BANDSINTOWN_ARTISTS)")
        return
    horizon = datetime.now(timezone.utc) + timedelta(days=days_ahead)
    seen: set = set()
    with PoliteClient() as client:
        for i, name in enumerate(names[: max_pages * 10]):
            url = f"{API_BASE}/artists/{quote(name, safe='')}/events"
            try:
                data = client.get_json(url, params={"app_id": app_id, "date": "upcoming"})
            except BudgetExceeded:
                raise
            if data is None and i == 0:
                print(f"  [{SOURCE}] blocked: API refused the first request (check BANDSINTOWN_APP_ID)")
                return
            for ev in parse_artist_events(data, name):
                if datetime.fromisoformat(ev["start_date"]) > horizon:
                    continue
                if ev["source_id"] not in seen:
                    seen.add(ev["source_id"])
                    yield ev
