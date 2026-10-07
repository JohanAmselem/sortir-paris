"""
Shotgun spider — club nights / electronic music in Paris.
Source: https://shotgun.live/fr/cities/paris

Status (2026-10-07): BLOCKED. Every page (city page, city events page) answers HTTP 429
with a "Vercel Security Checkpoint" JavaScript challenge to our honest bot UA, and the
former api.shotgun.live endpoint used here was guessed (no documented public API).
We never bypass bot protection → fetch_events logs one line and yields nothing.

If the challenge is lifted, the parser reads schema.org JSON-LD Events from the city
page (utils.jsonld), category "concerts".
"""

from __future__ import annotations

from typing import Generator, List

from utils.http import BudgetExceeded, PoliteClient
from utils.jsonld import events_from_html

SOURCE = "shotgun"
CITY_URL = "https://shotgun.live/fr/cities/paris"

_CHALLENGE_MARKERS = ("Vercel Security Checkpoint", "cf-challenge", "Attention Required! | Cloudflare",
                      "challenge-platform")


def is_challenge(html: str) -> bool:
    return any(m in (html or "") for m in _CHALLENGE_MARKERS)


def parse_page(html: str, base_url: str = CITY_URL) -> List[dict]:
    if is_challenge(html):
        return []
    return events_from_html(html, source=SOURCE, base_url=base_url, category_slug="concerts")


def fetch_events(days_ahead: int = 60, max_pages: int = 10) -> Generator[dict, None, None]:
    with PoliteClient(retries=0) as client:
        try:
            resp = client.get(CITY_URL)
        except BudgetExceeded:
            raise
        except Exception as e:
            print(f"  [{SOURCE}] blocked: {type(e).__name__} on {CITY_URL}")
            return
    if resp.status_code != 200 or is_challenge(resp.text):
        print(f"  [{SOURCE}] blocked: HTTP {resp.status_code} / bot challenge on {CITY_URL} — no public feed")
        return
    events = parse_page(resp.text)
    if not events:
        print(f"  [{SOURCE}] no JSON-LD events on {CITY_URL}")
    for ev in events:
        yield ev
