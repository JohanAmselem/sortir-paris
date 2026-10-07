"""
InfoConcert spider.
Source: https://www.infoconcert.com (concert listings; public structured data JSON-LD).

Status (checked 2026-10-07): every page incl. sitemap.xml answers HTTP 403 with a
Cloudflare "Just a moment..." JS challenge to our honest bot UA. We never bypass
challenges → fetch_events logs "blocked" and yields nothing until access is granted
(e.g. a partner feed or allow-listing of PanameClubBot).

Parser (kept ready, offline-tested): one concert page → its schema.org
MusicEvent JSON-LD only. The old spider's bugs are fixed by construction:
  - dates come from the event's own startDate (not "first date anywhere on the page");
  - price comes from the event's offers (price_from_offers), never from page text,
    and "free" only when the offer says 0 € / isAccessibleForFree;
  - shared placeholder images are dropped per run (drop_shared_images);
  - only Paris / Île-de-France venues are kept.
No HTML fallback: without JSON-LD a page is skipped rather than guessed.
"""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import Dict, Generator, Iterable, List, Optional, Set
from urllib.parse import urlparse

from utils.http import BudgetExceeded, PoliteClient
from utils.jsonld import event_from_jsonld, extract_jsonld, iter_events
from utils.normalize import IDF_DEPARTMENTS, in_idf

SOURCE = "infoconcert"
DOMAIN = "https://www.infoconcert.com"
SITEMAP_INDEX = f"{DOMAIN}/sitemap.xml"

_GENERIC_IMG_RE = re.compile(r"(default|placeholder|no[-_]?image|noimage|logo|fallback|generique)", re.I)


def is_challenge(html: Optional[str]) -> bool:
    if not html:
        return False
    head = html[:6000]
    return "Just a moment..." in head or "challenges.cloudflare.com" in head or "cf-chl" in head


def _in_idf(ev: dict) -> bool:
    if ev.get("venue_lat") is not None and ev.get("venue_lng") is not None:
        return in_idf(ev["venue_lat"], ev["venue_lng"])
    z = ev.get("venue_zip") or ""
    return z[:2] in IDF_DEPARTMENTS


def parse_detail(html: str, url: str) -> List[dict]:
    """Concert page → its IDF MusicEvent(s) from JSON-LD. [] for challenge pages / no JSON-LD."""
    if is_challenge(html):
        return []
    out: List[dict] = []
    seen = set()
    for obj in iter_events(extract_jsonld(html or "")):
        ev = event_from_jsonld(obj, source=SOURCE, base_url=url, category_slug="concerts")
        if not ev or ev["is_online"] or not ev.get("venue_name") or not _in_idf(ev):
            continue
        if ev["source_id"] in seen:
            continue
        seen.add(ev["source_id"])
        out.append(ev)
    return out


def drop_shared_images(events: Iterable[dict], max_titles: int = 2) -> List[dict]:
    """Remove placeholder images: an image URL used by more than `max_titles`
    different titles within a run, or a generic/default image path → image_url=None."""
    events = [dict(e) for e in events]
    titles: Dict[str, Set[str]] = {}
    for e in events:
        img = e.get("image_url")
        if img:
            titles.setdefault(img, set()).add((e.get("title") or "").strip().lower())
    shared = {img for img, t in titles.items() if len(t) > max_titles}
    for e in events:
        img = e.get("image_url")
        if img and (img in shared or _GENERIC_IMG_RE.search(urlparse(img).path)):
            e["image_url"] = None
    return events


def parse_sitemap(xml_text: str) -> List[str]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []
    return [el.text.strip() for el in root.iter() if el.tag.endswith("loc") and el.text]


def fetch_events(max_pages: int = 15, days_ahead: int = 90) -> Generator[dict, None, None]:
    """max_pages = number of concert sitemaps read (most recent first)."""
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=days_ahead)
    with PoliteClient(retries=1) as client:
        try:
            resp = client.get(SITEMAP_INDEX)
        except BudgetExceeded:
            raise
        except Exception as e:
            print(f"  [{SOURCE}] unreachable: {e}")
            return
        if resp.status_code != 200 or is_challenge(resp.text):
            print(f"  [{SOURCE}] blocked: HTTP {resp.status_code} — Cloudflare challenge, not bypassed; yielding nothing")
            return
        sitemaps = [u for u in parse_sitemap(resp.text) if "/concerts/" in u or "concert" in u]
        urls: List[str] = []
        for sm in sitemaps[-max_pages:]:
            text = client.get_text(sm)
            if text and not is_challenge(text):
                urls += [u for u in parse_sitemap(text) if "-paris-" in u]
        print(f"  [{SOURCE}] {len(urls)} Paris concert URLs")

        events: List[dict] = []
        blocked = 0
        out_of_budget = False
        for url in urls:
            try:
                html = client.get_text(url)
            except BudgetExceeded:
                out_of_budget = True  # yield what we have (images de-duplicated), then re-raise
                break
            if html is None or is_challenge(html):
                blocked += 1
                if blocked >= 5 and not events:
                    print(f"  [{SOURCE}] blocked on detail pages — stopping")
                    break
                continue
            try:
                for ev in parse_detail(html, url):
                    start = datetime.fromisoformat(ev["start_date"])
                    if now <= start <= cutoff:
                        events.append(ev)
            except Exception as e:
                print(f"  [{SOURCE}] parse error {url}: {e}")
    for ev in drop_shared_images(events):
        yield ev
    print(f"  [{SOURCE}] {len(events)} concerts")
    if out_of_budget:
        raise BudgetExceeded("infoconcert: time budget exhausted")


if __name__ == "__main__":
    for ev in fetch_events(max_pages=1):
        print(json.dumps(ev, ensure_ascii=False, indent=1))
