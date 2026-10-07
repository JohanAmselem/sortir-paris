"""
Generic, config-driven venue spider: public structured data published by venues
themselves (schema.org JSON-LD Event objects, iCalendar feeds).

Venues are declared in spiders/venues_config.py (one VenueSource entry per venue).
Each venue is its own DB source: f"venue_{key}".

Usage:
    fetch_events()                    # all enabled venues, failures isolated
    fetch_events(keys=["olympia"])    # a subset (disabled ones can be forced by key)
    fetch_venue("chatelet", max_details=5)

Pure parsing helpers (tested offline on fixtures):
    parse_listing_links(html, base_url, pattern) -> list[str]
    parse_jsonld_page(html, page_url, venue, now=None) -> list[dict]
    parse_ics_feed(text, venue, now=None) -> list[dict]
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Dict, Iterable, Iterator, List, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from urllib.robotparser import RobotFileParser

from bs4 import BeautifulSoup

from spiders.venues_config import VENUES, VENUES_BY_KEY, VenueSource
from utils.http import USER_AGENT, BudgetExceeded, PoliteClient
from utils.ics import events_from_ics
from utils.jsonld import (
    TYPE_TO_CATEGORY, _types, event_from_jsonld, extract_jsonld, iter_events, location_from,
)
from utils.normalize import absolute_url, clean_text, detect_category

BOT_NAME = USER_AGENT.split("/")[0]  # "PanameClubBot"

# ─────────────────────────────── small fixers ───────────────────────────────

_ISO_PREFIX = re.compile(
    r"^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?"
)
_TRACKING_PARAMS = re.compile(r"^(utm_|fbclid$|gclid$|mc_|_ga$)", re.I)


def clean_iso(value, local_time_offsets: bool = False):
    """Keep only a well-formed ISO prefix of a schema.org date.

    '2026-10-11T17:50:00+0200T00:00-00:00' → '2026-10-11T17:50:00+02:00'
    '2026-10-09T17:30:00.000Z'             → '2026-10-09T17:30:00+00:00'
    local_time_offsets=True drops the offset (site writes Paris local time with a bogus one).
    """
    if not isinstance(value, str):
        return value
    m = _ISO_PREFIX.match(value.strip())
    if not m:
        return value
    day, clock, tz = m.groups()
    if not clock:
        return day
    if local_time_offsets or not tz:
        tz = ""
    elif tz == "Z":
        tz = "+00:00"
    elif ":" not in tz:
        tz = tz[:3] + ":" + tz[3:]
    return f"{day}T{clock}{tz}"


def clean_url(url: Optional[str]) -> Optional[str]:
    """Drop tracking query params and fragments."""
    if not isinstance(url, str) or not url.strip():
        return None
    p = urlparse(url.strip())
    q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if not _TRACKING_PARAMS.match(k)]
    return urlunparse(p._replace(query=urlencode(q), fragment=""))


def _fix_image(v):
    """'https://a.comhttps://a.com/x.jpg' (seen on chatelet.com) → last absolute URL."""
    if isinstance(v, str):
        i = v.rfind("http://") if v.rfind("http://") > 0 else v.rfind("https://")
        return v[i:] if i > 0 else v
    if isinstance(v, list):
        return [_fix_image(x) for x in v]
    if isinstance(v, dict):
        d = dict(v)
        for k in ("url", "contentUrl"):
            if k in d:
                d[k] = _fix_image(d[k])
        return d
    return v


def _midnight(value) -> bool:
    return isinstance(value, str) and bool(re.search(r"T00:00(:00)?([+-]|$)", value))


def _flatten_address(loc):
    """streetAddress given as a list (musee-orangerie.fr) → one comma-joined string."""
    if not isinstance(loc, dict) or not isinstance(loc.get("address"), dict):
        return loc
    street = loc["address"].get("streetAddress")
    if isinstance(street, list):
        loc = dict(loc)
        loc["address"] = dict(loc["address"], streetAddress=", ".join(str(x) for x in street if x))
    return loc


def _words(text: Optional[str]) -> set:
    from unidecode import unidecode

    return {w for w in re.findall(r"[a-z0-9]{5,}", unidecode(text or "").lower())}


def _same_place(loc_name: Optional[str], venue_name: Optional[str]) -> bool:
    if not loc_name:
        return True
    a, b = _words(loc_name), _words(venue_name)
    return bool(a & b) if a and b else False


def _is_past(ev: dict, now: datetime) -> bool:
    ref = ev.get("end_date") or ev.get("start_date")
    if not ref:
        return True
    try:
        return datetime.fromisoformat(ref) < now
    except ValueError:
        return False


def _venue_category(obj: dict, venue: VenueSource) -> Optional[str]:
    """For venues with a known dominant genre: schema.org type > title/genre keywords >
    fallback. Description keywords are ignored (artist bios mention "atelier", "expo"…)."""
    if not venue.fallback_category:
        return None
    for t in _types(obj):
        if t in TYPE_TO_CATEGORY:
            return TYPE_TO_CATEGORY[t]
    genre = obj.get("genre")
    if isinstance(genre, list):
        genre = ", ".join(str(g) for g in genre)
    cat = detect_category(genre if isinstance(genre, str) else None, clean_text(obj.get("name")) or "",
                          None, source_map=venue.category_map)
    return cat or venue.fallback_category


def _too_long(ev: dict, max_days: Optional[int]) -> bool:
    if not max_days or not ev.get("end_date") or not ev.get("start_date"):
        return False
    try:
        span = datetime.fromisoformat(ev["end_date"]) - datetime.fromisoformat(ev["start_date"])
    except ValueError:
        return False
    return span.days > max_days


def _finalize(evs: Iterable[dict], venue: VenueSource, now: Optional[datetime]) -> List[dict]:
    now = now or datetime.now(timezone.utc)
    excl = re.compile(venue.exclude_title_regex, re.I) if venue.exclude_title_regex else None
    out = []
    for ev in evs:
        if not ev or _is_past(ev, now):
            continue
        if _too_long(ev, venue.max_span_days):
            continue  # e.g. a one-off concert published as a year-long range
        if excl and excl.search(ev.get("title") or ""):
            continue
        if not ev.get("category_slug") and venue.fallback_category:
            ev["category_slug"] = venue.fallback_category
        ev["tags_raw"] = [t for t in ev.get("tags_raw") or [] if t.lower() not in ("no information", "n/a")]
        ev["venue_website"] = ev.get("venue_website") or _site_root(venue)
        out.append(ev)
    return out


def _site_root(venue: VenueSource) -> Optional[str]:
    if not venue.urls:
        return None
    p = urlparse(venue.urls[0])
    return f"{p.scheme}://{p.netloc}"


# ─────────────────────────────── pure parsers ───────────────────────────────

def parse_listing_links(html: str, base_url: str, pattern: Optional[str]) -> List[str]:
    """Absolute detail URLs matching `pattern`, in page order, deduplicated.
    Reads <a href> and sitemap <loc> elements."""
    if not html or not pattern:
        return []
    rx = re.compile(pattern)
    soup = BeautifulSoup(html, "html.parser")
    raw = [a.get("href") for a in soup.find_all("a", href=True)]
    raw += [loc.get_text(strip=True) for loc in soup.find_all("loc")]
    out: List[str] = []
    seen = set()
    for href in raw:
        url = absolute_url(base_url, (href or "").strip())
        if not url:
            continue
        url = url.split("#", 1)[0]
        if url in seen or not rx.search(url):
            continue
        seen.add(url)
        out.append(url)
    return out


def parse_jsonld_page(
    html: str, page_url: str, venue: VenueSource, now: Optional[datetime] = None
) -> List[dict]:
    """All schema.org Events of one page → event dicts (past events dropped)."""
    objs = extract_jsonld(html)
    evs = []
    for obj in iter_events(objs):
        subs = obj.get("subEvent") or obj.get("subEvents")
        if isinstance(subs, dict):
            subs = [subs]
        if isinstance(subs, list) and any(isinstance(s, dict) and s.get("startDate") for s in subs):
            continue  # season-long parent; its dated sub-events are emitted instead
        o = dict(obj)
        o["startDate"] = clean_iso(o.get("startDate"), venue.local_time_offsets)
        if isinstance(o["startDate"], list):
            o["startDate"] = clean_iso(o["startDate"][0], venue.local_time_offsets)
        o["endDate"] = clean_iso(o.get("endDate"), venue.local_time_offsets)
        if _midnight(o["endDate"]) and isinstance(o["startDate"], str) and "T" in o["startDate"]                 and not _midnight(o["startDate"]):
            o["endDate"] = None  # "ends at 00:00" on a timed show = no real end time
        o["location"] = _flatten_address(o.get("location"))
        if isinstance(o.get("url"), str):
            o["url"] = clean_url(absolute_url(page_url, o["url"]))
        else:
            o["url"] = clean_url(page_url)
        if "image" in o:
            o["image"] = _fix_image(o["image"])
        loc = location_from(o.get("location"))
        default_venue = venue.default_venue if _same_place(loc.get("venue_name"),
                                                           venue.default_venue.get("venue_name")) else None
        try:
            ev = event_from_jsonld(
                o,
                source=venue.source,
                base_url=page_url,
                default_venue=default_venue,
                category_slug=venue.category_slug or _venue_category(o, venue),
                category_map=venue.category_map,
                midnight_unknown=venue.midnight_unknown,
            )
        except Exception as e:  # one bad object never kills the page
            print(f"  [{venue.source}] skipped malformed Event on {page_url}: {e}")
            continue
        if ev:
            evs.append(ev)
    return _finalize(evs, venue, now)


def parse_ics_feed(text: str, venue: VenueSource, now: Optional[datetime] = None) -> List[dict]:
    if not text or "BEGIN:VCALENDAR" not in text[:2000]:
        return []
    evs = events_from_ics(
        text, source=venue.source, default_venue=venue.default_venue, category_slug=venue.category_slug
    )
    return _finalize(evs, venue, now)


# ─────────────────────────────── network ───────────────────────────────

class _Robots:
    """robots.txt cache, one fetch per host per run."""

    def __init__(self, client: PoliteClient):
        self.client = client
        self.cache: Dict[str, Optional[RobotFileParser]] = {}

    def allowed(self, url: str) -> bool:
        p = urlparse(url)
        host = f"{p.scheme}://{p.netloc}"
        if host not in self.cache:
            rp = None
            try:
                resp = self.client.get(host + "/robots.txt")
                if resp.status_code == 200:
                    rp = RobotFileParser()
                    rp.parse(resp.text.splitlines())
            except BudgetExceeded:
                raise
            except Exception:
                rp = None
            self.cache[host] = rp
        rp = self.cache[host]
        return True if rp is None else rp.can_fetch(BOT_NAME, url)


def _listing_urls(venue: VenueSource) -> List[str]:
    out = []
    for u in venue.urls:
        if "{page}" in u:
            out.extend(u.format(page=i) for i in range(1, max(1, venue.max_pages) + 1))
        else:
            out.append(u)
    return out


def _fetch(client: PoliteClient, robots: _Robots, venue: VenueSource, url: str) -> Optional[str]:
    if not robots.allowed(url):
        print(f"  [{venue.source}] robots.txt disallows {url} — skipped")
        return None
    return client.get_text(url)


def fetch_venue(key: str, *, max_details: Optional[int] = None,
                client: Optional[PoliteClient] = None) -> Iterator[dict]:
    """Yield events of one venue (works for disabled entries too, for testing)."""
    venue = VENUES_BY_KEY[key]
    own = client is None
    client = client or PoliteClient(delay=1.0, retries=2, timeout=40)
    robots = _Robots(client)
    cap = venue.max_details if max_details is None else max_details
    n = 0
    try:
        if venue.kind == "ics":
            for url in _listing_urls(venue):
                text = _fetch(client, robots, venue, url)
                if text is None:
                    continue
                evs = parse_ics_feed(text, venue)
                if not evs and "BEGIN:VCALENDAR" not in text[:2000]:
                    print(f"  [{venue.source}] {url} is not an iCal feed")
                for ev in evs:
                    n += 1
                    yield ev
        elif venue.kind in ("jsonld", "jsonld_detail"):
            details: List[str] = []
            for url in _listing_urls(venue):
                html = _fetch(client, robots, venue, url)
                if html is None:
                    break  # failing page (often past the last page) → stop paginating
                if venue.kind == "jsonld":
                    evs = parse_jsonld_page(html, url, venue)
                    if not evs and "{page}" in (venue.urls[0] or ""):
                        break
                    for ev in evs:
                        n += 1
                        yield ev
                else:
                    new = [u for u in parse_listing_links(html, url, venue.detail_link_regex)
                           if u not in details]
                    details.extend(new)
                    if not new:
                        break
            if venue.kind == "jsonld_detail":
                if not details:
                    print(f"  [{venue.source}] no detail links found on listing")
                for url in details[:cap]:
                    try:
                        html = _fetch(client, robots, venue, url)
                        if html is None:
                            continue
                        for ev in parse_jsonld_page(html, url, venue):
                            n += 1
                            yield ev
                    except BudgetExceeded:
                        raise
                    except Exception as e:
                        print(f"  [{venue.source}] detail {url} failed: {e}")
        else:
            print(f"  [{venue.source}] unknown kind {venue.kind!r}")
    finally:
        if own:
            client.close()
    print(f"  [{venue.source}] {n} events")


def fetch_events(keys: Optional[List[str]] = None, *, max_details: Optional[int] = None) -> Iterator[dict]:
    """All enabled venues (or the given keys). Each venue's failure is isolated and logged."""
    selected = [VENUES_BY_KEY[k] for k in keys] if keys else [v for v in VENUES if v.enabled]
    with PoliteClient(delay=1.0, retries=2, timeout=40) as client:
        for venue in selected:
            try:
                yield from fetch_venue(venue.key, max_details=max_details, client=client)
            except BudgetExceeded:
                raise
            except Exception as e:
                print(f"  [{venue.source}] failed: {type(e).__name__}: {e}")
