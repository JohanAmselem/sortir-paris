"""
Generic, config-driven venue spider: public structured data published by venues
themselves (schema.org JSON-LD or microdata Event objects, iCalendar feeds, the
WordPress "The Events Calendar" REST API).

Venues are declared in spiders/venues_config.py (one VenueSource entry per venue,
ALL_VENUES = hand-curated VENUES + DISCOVERED_VENUES written by tools/discover_venues.py).
Each venue is its own DB source: f"venue_{key}".

Usage:
    fetch_events()                    # all enabled venues, failures isolated
    fetch_events(shard=0, shards=3)   # one third of the enabled venues (balanced by requests)
    fetch_events(keys=["olympia"])    # a subset (disabled ones can be forced by key)
    fetch_venue("chatelet", max_details=5)

Pure parsing helpers (tested offline on fixtures):
    parse_listing_links(html, base_url, pattern) -> list[str]
    parse_itemlist_links(html, base_url) -> list[str]
    parse_jsonld_page(html, page_url, venue, now=None) -> list[dict]   (JSON-LD, else microdata)
    parse_ics_feed(text, venue, now=None) -> list[dict]
    parse_tribe_page(data, venue, now=None) -> list[dict]
    estimate_requests(venue) / plan_shards(venues, shards) -> runtime planning
"""

from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from typing import Dict, Iterable, Iterator, List, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from urllib.robotparser import RobotFileParser

from bs4 import BeautifulSoup

from spiders.venues_config import ALL_VENUES, ALL_VENUES_BY_KEY, VenueSource
from utils.http import USER_AGENT, BudgetExceeded, PoliteClient
from utils.ics import events_from_ics
from utils.jsonld import (
    TYPE_TO_CATEGORY, _types, event_from_jsonld, extract_jsonld, iter_events, location_from,
)
from utils.normalize import absolute_url, clean_text, detect_category, extract_zip
from utils.wp_events import events_from_tribe, tribe_next_url, tribe_url

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


_CITY_ONLY = re.compile(r"^\s*(paris|paris\s*\d{1,2}(e|er|ème)?|france|[a-zà-ÿ' -]+,\s*france)\s*$", re.I)


def _tidy_location(loc, venue: VenueSource):
    """Normalise the schema.org location of one Event before mapping:
    - name given as a list → joined; a bare city name ("Paris") → no name;
    - address string identical to the name → no address (it carries nothing);
    - single-site venue: a location without any address is a room of the venue → None,
      so the default venue applies in full."""
    if isinstance(loc, list):
        loc = next((x for x in loc if isinstance(x, dict)), loc[0] if loc else None)
    if not isinstance(loc, dict):
        if isinstance(loc, str) and venue.single_site:
            return None
        return loc
    loc = dict(loc)
    name = loc.get("name")
    if isinstance(name, list):
        name = " – ".join(str(x) for x in name if x)
        loc["name"] = name
    if isinstance(name, str) and _CITY_ONLY.match(name):
        loc.pop("name", None)
    addr = loc.get("address")
    if isinstance(addr, str) and isinstance(loc.get("name"), str) and \
            addr.strip().lower().replace("-", " ") == loc["name"].strip().lower().replace("-", " "):
        loc.pop("address", None)
    if venue.single_site:
        a = loc.get("address")
        has_addr = (isinstance(a, dict) and (a.get("streetAddress") or a.get("postalCode"))) or \
                   (isinstance(a, str) and a.strip()) or isinstance(loc.get("geo"), dict)
        if not has_addr:
            return None
    return loc


def _local_hhmm(iso: Optional[str]) -> Optional[str]:
    from utils.dates import paris_local

    dt = paris_local(iso) if iso else None
    return dt.strftime("%H:%M") if dt else None


def _located(ev: dict) -> Optional[bool]:
    """In zone (True) / out of zone (False) / unknown (None), from zip then coordinates."""
    from utils.normalize import SERVICE_DEPARTMENTS, in_service_zone

    z = str(ev.get("venue_zip") or "").strip()
    if re.fullmatch(r"\d{5}", z):
        return z[:2] in SERVICE_DEPARTMENTS
    if ev.get("venue_lat") is not None and ev.get("venue_lng") is not None:
        return in_service_zone(ev["venue_lat"], ev["venue_lng"])
    return None


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
        if venue.noon_unknown and ev.get("time_known") and _local_hhmm(ev.get("start_date")) == "12:00":
            ev["time_known"] = False  # placeholder time; 12:00 local is also our date-only convention
            if ev.get("end_date") == ev.get("start_date"):
                ev["end_date"] = None
        if not ev.get("venue_zip") and ev.get("venue_address"):
            ev["venue_zip"] = extract_zip(ev["venue_address"])  # "24 bd Poissonnière 75009 Paris"
        if venue.require_location and not _located(ev):
            continue  # multi-venue source: unknown or out-of-zone place is never guessed
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


def parse_itemlist_links(html: str, base_url: str, pattern: Optional[str] = None) -> List[str]:
    """URLs of a schema.org ItemList whose elements are bare ListItems ({"url": …}),
    i.e. a listing that points at detail pages carrying the Event objects."""
    rx = re.compile(pattern) if pattern else None
    out: List[str] = []
    for obj in extract_jsonld(html):
        if "itemlist" not in _types(obj):
            continue
        for el in obj.get("itemListElement") or []:
            if not isinstance(el, dict):
                continue
            item = el.get("item")
            url = el.get("url") or (item.get("url") or item.get("@id") if isinstance(item, dict) else item)
            if not isinstance(url, str):
                continue
            url = absolute_url(base_url, url.strip())
            if url and url not in out and (rx is None or rx.search(url)):
                out.append(url.split("#", 1)[0])
    return out


# ── microdata (itemscope / itemprop) → JSON-LD-shaped dicts ──

_MICRO_EVENT = re.compile(r"schema\.org/(\w*Event|Festival|EventSeries)\b", re.I)


def _micro_value(el):
    if el.has_attr("itemscope"):
        return _micro_item(el)
    if el.name == "meta":
        return el.get("content")
    if el.name in ("a", "link", "area"):
        return el.get("href")
    if el.name in ("img", "audio", "video", "source", "embed", "iframe"):
        return el.get("src") or el.get("data-src")
    if el.name == "time":
        return el.get("datetime") or el.get_text(" ", strip=True)
    if el.name in ("data", "meter"):
        return el.get("value")
    return el.get("content") or el.get_text(" ", strip=True)


def _micro_item(root) -> dict:
    out: dict = {}
    itemtype = root.get("itemtype") or ""
    if itemtype:
        out["@type"] = itemtype.strip().split()[0].rstrip("/").rsplit("/", 1)[-1]
    stack = list(root.find_all(True, recursive=False))
    while stack:
        el = stack.pop(0)
        props = (el.get("itemprop") or "").split()
        if props:
            val = _micro_value(el)
            for prop in props:
                if prop in out:
                    out[prop] = out[prop] if isinstance(out[prop], list) else [out[prop]]
                    out[prop].append(val)
                else:
                    out[prop] = val
        if el.has_attr("itemscope"):
            continue  # nested item: its properties are its own
        stack[0:0] = list(el.find_all(True, recursive=False))
    return out


def extract_microdata_events(html: str) -> List[dict]:
    """Top-level schema.org Event items written as microdata."""
    soup = BeautifulSoup(html or "", "html.parser")
    out = []
    for el in soup.find_all(attrs={"itemscope": True, "itemtype": _MICRO_EVENT}):
        if el.find_parent(attrs={"itemscope": True, "itemtype": _MICRO_EVENT}):
            continue  # sub-event: emitted through its parent's subEvent
        item = _micro_item(el)
        for k in ("startDate", "endDate", "name", "url", "description"):
            if isinstance(item.get(k), list):
                item[k] = item[k][0]
        out.append(item)
    return out


def parse_jsonld_page(
    html: str, page_url: str, venue: VenueSource, now: Optional[datetime] = None
) -> List[dict]:
    """All schema.org Events of one page → event dicts (past events dropped).
    JSON-LD first; microdata Events when the page has no JSON-LD Event."""
    objs = extract_jsonld(html)
    if not any(True for _ in iter_events(objs)):
        objs = extract_microdata_events(html)
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
        o["location"] = _flatten_address(_tidy_location(o.get("location"), venue))
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
    for ev in evs:
        if not ev.get("venue_zip"):  # LOCATION "Salle X, 12 rue Y 93100 Montreuil"
            ev["venue_zip"] = extract_zip(ev.get("venue_address"))
        if not ev.get("category_slug") and venue.category_map:
            ev["category_slug"] = detect_category(", ".join(ev.get("tags_raw") or []) or None,
                                                  ev.get("title") or "", None,
                                                  source_map=venue.category_map)
    return _finalize(evs, venue, now)


def parse_tribe_page(data, venue: VenueSource, now: Optional[datetime] = None) -> List[dict]:
    """One page of The Events Calendar REST API → event dicts (past events dropped)."""
    if venue.single_site and isinstance(data, dict) and isinstance(data.get("events"), list):
        def room_only(v):
            return isinstance(v, dict) and not (v.get("address") or v.get("zip") or v.get("geo_lat"))

        data = dict(data, events=[dict(e, venue=[]) if isinstance(e, dict) and room_only(e.get("venue"))
                                  else e for e in data["events"]])
    evs = events_from_tribe(
        data,
        source=venue.source,
        default_venue=venue.default_venue or None,
        same_place=_same_place,
        category_slug=venue.category_slug,
        category_map=venue.category_map,
    )
    return _finalize(evs, venue, now)


# ─────────────────────────────── planning ───────────────────────────────

SECONDS_PER_REQUEST = 1.3  # 1 req/s per host + typical latency of small venue servers


def estimate_requests(venue: VenueSource) -> int:
    """Upper bound of HTTP requests for one run of a venue (robots.txt included)."""
    pages = len(_listing_urls(venue))
    if venue.kind == "jsonld_detail":
        return 1 + pages + venue.max_details
    if venue.kind == "tribe":
        return 1 + max(1, venue.max_pages)
    return 1 + pages


def plan_shards(venues: List[VenueSource], shards: int) -> List[List[VenueSource]]:
    """Deterministic, balanced split (longest-processing-time first by request estimate)."""
    shards = max(1, int(shards))
    bins: List[List[VenueSource]] = [[] for _ in range(shards)]
    load = [0] * shards
    for v in sorted(venues, key=lambda v: (-estimate_requests(v), v.key)):
        i = min(range(shards), key=lambda j: (load[j], j))
        bins[i].append(v)
        load[i] += estimate_requests(v)
    return bins


def runtime_report(shards: int = 1) -> List[dict]:
    enabled = [v for v in ALL_VENUES if v.enabled]
    out = []
    for i, b in enumerate(plan_shards(enabled, shards)):
        req = sum(estimate_requests(v) for v in b)
        out.append({"shard": i, "venues": len(b), "requests": req,
                    "minutes": round(req * SECONDS_PER_REQUEST / 60, 1)})
    return out


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
    venue = ALL_VENUES_BY_KEY[key]
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
                    found = parse_listing_links(html, url, venue.detail_link_regex)
                    found += parse_itemlist_links(html, url, venue.detail_link_regex)
                    new = [u for u in dict.fromkeys(found) if u not in details]
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
        elif venue.kind == "tribe":
            url = venue.urls[0] if "tribe/events" in venue.urls[0] else tribe_url(venue.urls[0])
            seen_ids = set()
            for _ in range(max(1, venue.max_pages)):
                if not robots.allowed(url):
                    print(f"  [{venue.source}] robots.txt disallows {url} — skipped")
                    break
                data = client.get_json(url)
                if data is None:
                    break
                for ev in parse_tribe_page(data, venue):
                    if ev["source_id"] in seen_ids:
                        continue
                    seen_ids.add(ev["source_id"])
                    n += 1
                    yield ev
                url = tribe_next_url(data)
                if not url:
                    break
        else:
            print(f"  [{venue.source}] unknown kind {venue.kind!r}")
    finally:
        if own:
            client.close()
    print(f"  [{venue.source}] {n} events")


def select_venues(keys: Optional[List[str]] = None, shard: Optional[int] = None,
                  shards: int = 1) -> List[VenueSource]:
    if keys:
        return [ALL_VENUES_BY_KEY[k] for k in keys]
    enabled = [v for v in ALL_VENUES if v.enabled]
    if shard is None or shards <= 1:
        return enabled
    if not 0 <= shard < shards:
        raise ValueError(f"shard must be in 0..{shards - 1}")
    return plan_shards(enabled, shards)[shard]


def fetch_events(keys: Optional[List[str]] = None, *, max_details: Optional[int] = None,
                 shard: Optional[int] = None, shards: int = 1) -> Iterator[dict]:
    """All enabled venues (or the given keys, or one shard of the enabled venues).
    Each venue's failure is isolated and logged."""
    selected = select_venues(keys, shard, shards)
    if shard is not None:
        print(f"  [venues] shard {shard}/{shards}: {len(selected)} venues, "
              f"~{sum(estimate_requests(v) for v in selected)} requests")
    with PoliteClient(delay=1.0, retries=2, timeout=40) as client:
        for venue in selected:
            try:
                yield from fetch_venue(venue.key, max_details=max_details, client=client)
            except BudgetExceeded:
                raise
            except Exception as e:
                print(f"  [{venue.source}] failed: {type(e).__name__}: {e}")
