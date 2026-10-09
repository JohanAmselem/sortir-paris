"""
OpenAgenda API spider.
Source: https://openagenda.com — official API v2: https://developers.openagenda.com/
Legal basis: official API (needs OPENAGENDA_API_KEY, free "public key" from an
OpenAgenda account). Agenda list: spiders/openagenda_config.py.

Endpoints used:
  GET https://api.openagenda.com/v2/agendas/{agendaUID}/events
      ?key=…&size=300&detailed=1&monolingual=fr&relative[]=current&relative[]=upcoming
      &includeFields[]=…  [&department[]=Paris&department[]=Hauts-de-Seine…]
      (pagination: `after[]` cursor returned by the previous page)
  GET https://api.openagenda.com/v2/agendas?key=…&search=…&official=1   (discover_agendas)

Scale (2026-10-09): several hundred agendas (spiders/openagenda_config.py, found with
tools/discover_openagenda.py). Per agenda: one request per 300 events, at most
MAX_EVENTS_PER_AGENDA events, events outside 75/92/93/94 dropped before parsing, the
agenda abandoned when its whole first page is out of zone, and regional agendas
fetched with the server-side `department[]` filter. fetch_all(part="paris"|"couronne")
splits the list in two halves for two SourceSpecs if one budget is not enough.

Event shape (validated against the public events.v2.json export, 2026-10-07):
  title/description/longDescription/conditions: {lang: text} (or plain str with monolingual)
  timings: [{begin, end}] ISO with offset · location: {name, address, city, postalCode,
  latitude, longitude, website} · registration: [{type: link|email|phone, value}]
  attendanceMode: 1 offline, 2 online, 3 mixed · status: 1 scheduled, 2 rescheduled,
  3 moved online, 4 postponed, 5 full, 6 cancelled · image: {base, filename}
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from typing import Generator, Iterable, List, Optional, Sequence, Tuple

from spiders.openagenda_config import AGENDA_DEPT, AGENDA_IDS, DEPT_FILTER_IDS, PARTS  # AGENDA_IDS re-exported for run.py
from utils.dates import PARIS, to_utc_paris
from utils.event import make_event
from utils.http import BudgetExceeded, PoliteClient
from utils.normalize import in_service_zone, parse_price_fr

API_BASE = "https://api.openagenda.com/v2"
SOURCE = "openagenda"

# Timing selection: a run longer than this, or with gaps larger than MAX_GAP,
# is treated as scattered dates → the event ends with the selected occurrence.
MAX_RUN_DAYS = 400
MAX_GAP_DAYS = 45

STATUS_CANCELLED = 6
STATUS_POSTPONED = 4
STATUS_MOVED_ONLINE = 3
ATTENDANCE_ONLINE = 2

__all__ = [
    "AGENDA_IDS", "fetch_events", "fetch_all", "discover_agendas", "agendas_for_part",
    "parse_event", "parse_events_page", "select_occurrence",
    "location_zip", "location_department", "location_zone",
]


# ─────────────────────────── shared timing helper ───────────────────────────

def select_occurrence(
    occurrences: Iterable[Tuple[datetime, Optional[datetime]]],
    now: Optional[datetime] = None,
) -> Optional[Tuple[datetime, Optional[datetime]]]:
    """Pick (start, end) from a list of aware (begin, end) occurrences.

    - start = begin of the first occurrence whose end (or begin) is >= now;
    - end   = end of the LAST occurrence when the upcoming occurrences form a run
              (span <= MAX_RUN_DAYS and no gap > MAX_GAP_DAYS between them),
              otherwise the end of that next occurrence (scattered dates).
    Returns None when every occurrence is in the past.
    """
    now = now or datetime.now(timezone.utc)
    occ = sorted(((b, e) for b, e in occurrences if b is not None), key=lambda x: x[0])
    upcoming = [(b, e) for b, e in occ if (e or b) >= now]
    if not upcoming:
        return None
    first_b, first_e = upcoming[0]
    if len(upcoming) == 1:
        return first_b, first_e
    last_b, last_e = upcoming[-1]
    span = (last_e or last_b) - first_b
    max_gap = max(
        (upcoming[i + 1][0] - upcoming[i][0] for i in range(len(upcoming) - 1)),
        default=timedelta(0),
    )
    if span <= timedelta(days=MAX_RUN_DAYS) and max_gap <= timedelta(days=MAX_GAP_DAYS):
        return first_b, (last_e or last_b)
    return first_b, first_e


# ─────────────────────────── service zone (pure) ───────────────────────────

ZONE_DEPARTMENTS = ("75", "92", "93", "94")
# OpenAgenda `location.department` / `adminLevel2` names → code (also the values the
# `department[]` filter accepts).
DEPARTMENT_NAMES = {
    "75": "Paris",
    "92": "Hauts-de-Seine",
    "93": "Seine-Saint-Denis",
    "94": "Val-de-Marne",
}
_DEPT_BY_NAME = {v.lower(): k for k, v in DEPARTMENT_NAMES.items()}
_ZIP_RE = re.compile(r"\b(\d{5})\b")


def _coord(v) -> Optional[float]:
    """OpenAgenda encodes 'no coordinates' as 0 / 0: treat it as missing."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f or f == 0:
        return None
    return f


def location_zip(loc: dict) -> Optional[str]:
    """5-digit postcode from `postalCode`, else the first one found in `address`."""
    loc = loc or {}
    pc = str(loc.get("postalCode") or "").strip()
    if re.fullmatch(r"\d{5}", pc):
        return pc
    m = _ZIP_RE.search(str(loc.get("address") or ""))
    return m.group(1) if m else None


def location_department(loc: dict) -> Optional[str]:
    """Department code ('75', '93', '78'…) of an OpenAgenda location, or None if unknown."""
    loc = loc or {}
    z = location_zip(loc)
    if z:
        return "2A" if z.startswith("20") else z[:2]
    for key in ("department", "adminLevel2"):
        name = str(loc.get(key) or "").strip().lower()
        if name:
            return _DEPT_BY_NAME.get(name, "other")
    return None


def location_zone(loc: dict) -> str:
    """'in' (75/92/93/94), 'out', or 'unknown' (no postcode, department or coordinates)."""
    dept = location_department(loc)
    if dept is not None:
        return "in" if dept in ZONE_DEPARTMENTS else "out"
    lat, lng = _coord((loc or {}).get("latitude")), _coord((loc or {}).get("longitude"))
    if lat is not None and lng is not None:
        # the bounding box also covers bits of 78/91/95/77; good enough when nothing else is known
        return "in" if in_service_zone(lat, lng) else "out"
    return "unknown"


# ─────────────────────────── parsing (pure) ───────────────────────────

def _txt(value, lang: str = "fr") -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value or None
    if isinstance(value, dict):
        for k in (lang, "en"):
            if value.get(k):
                return value[k]
        for v in value.values():
            if isinstance(v, str) and v:
                return v
    return None


def _keywords(raw) -> List[str]:
    kw = raw.get("keywords")
    if isinstance(kw, dict):
        kw = kw.get("fr") or kw.get("en") or []
    if isinstance(kw, str):
        kw = [kw]
    return [str(k) for k in (kw or []) if k]


def _image(raw) -> Optional[str]:
    img = raw.get("image")
    if isinstance(img, str):
        return img or None
    if isinstance(img, dict):
        base = img.get("base") or ""
        fn = img.get("filename")
        if fn:
            return fn if fn.startswith("http") else base + fn
    return None


def _booking(registration) -> Optional[str]:
    if not isinstance(registration, list):
        return None
    by_type = {}
    for r in registration:
        if isinstance(r, dict) and r.get("value"):
            by_type.setdefault(str(r.get("type") or "").lower(), str(r["value"]).strip())
    if by_type.get("link"):
        link = by_type["link"]
        return link if link.startswith("http") else "https://" + link.lstrip("/")
    if by_type.get("email"):
        return "mailto:" + by_type["email"]
    if by_type.get("phone"):
        return "tel:" + by_type["phone"].replace(" ", "")
    return None


def _timings(raw) -> List[Tuple[datetime, Optional[datetime]]]:
    out = []
    for t in raw.get("timings") or []:
        if not isinstance(t, dict):
            continue
        b = to_utc_paris(t.get("begin"))
        e = to_utc_paris(t.get("end"))
        if b is None:
            continue
        if e is not None and e < b:
            e = None
        out.append((b, e))
    return out


def _source_url(raw, agenda_uid, agenda_slug: Optional[str]) -> str:
    if raw.get("canonicalUrl"):
        return raw["canonicalUrl"]
    origin = raw.get("originAgenda") or {}
    slug = agenda_slug or origin.get("slug")
    if slug and raw.get("slug"):
        return f"https://openagenda.com/{slug}/events/{raw['slug']}"
    return f"https://openagenda.com/agendas/{agenda_uid}/events/{raw.get('uid')}"


def parse_event(raw: dict, agenda_uid=None, agenda_slug: Optional[str] = None,
                now: Optional[datetime] = None) -> Optional[dict]:
    """One OpenAgenda v2 event → event dict (None if past / unusable)."""
    title = _txt(raw.get("title"))
    if not title:
        return None
    status = raw.get("status")
    if status == STATUS_POSTPONED:
        return None  # "reporté": the timings no longer hold, no new date yet
    picked = select_occurrence(_timings(raw), now=now)
    if picked is None:
        return None
    start, end = picked

    loc = raw.get("location") or {}
    conditions = _txt(raw.get("conditions"))
    keywords = _keywords(raw)
    online = raw.get("attendanceMode") == ATTENDANCE_ONLINE or status == STATUS_MOVED_ONLINE
    source_url = _source_url(raw, agenda_uid, agenda_slug)

    return make_event(
        source=SOURCE,
        source_id=str(raw.get("uid")) if raw.get("uid") else None,
        title=title,
        start=start,
        end=end,
        midnight_unknown=True,  # all-day timings are encoded 00:00 → 23:59
        description=_txt(raw.get("longDescription")) or _txt(raw.get("description")),
        short_desc=_txt(raw.get("description")),
        image_url=_image(raw),
        price_raw=conditions,
        booking_url=_booking(raw.get("registration")),
        source_url=source_url,
        venue_name=loc.get("name"),
        venue_address=loc.get("address"),
        venue_city=loc.get("city"),
        venue_zip=location_zip(loc),
        venue_lat=_coord(loc.get("latitude")),
        venue_lng=_coord(loc.get("longitude")),
        venue_website=loc.get("website"),
        category_raw=", ".join(keywords) if keywords else None,
        tags=keywords,
        event_status="cancelled" if status == STATUS_CANCELLED else "scheduled",
        is_online=True if online else None,
    )


def parse_events_page(data: dict, agenda_uid=None, now: Optional[datetime] = None) -> List[dict]:
    """A page of /v2/agendas/{uid}/events (or the public events.v2.json) → event dicts."""
    out = []
    for raw in (data or {}).get("events") or []:
        try:
            ev = parse_event(raw, agenda_uid=agenda_uid, now=now)
        except Exception as e:  # one bad item never kills the agenda
            print(f"  [openagenda] skip event {raw.get('uid')}: {type(e).__name__}: {e}")
            continue
        if ev:
            out.append(ev)
    return out


# ─────────────────────────── network ───────────────────────────

PAGE_SIZE = 300              # API v2 maximum
MAX_EVENTS_PER_AGENDA = 3000  # raw events read per agenda (≤ 10 requests)
# Stop an agenda after its first page when this many located events are all out of zone.
OUT_OF_ZONE_ABORT_MIN = 10
# Only the fields parse_event() reads (smaller responses, faster runs).
INCLUDE_FIELDS = (
    "uid", "slug", "canonicalUrl", "originAgenda", "title", "description", "longDescription",
    "conditions", "keywords", "image", "timings", "location", "registration", "status",
    "attendanceMode",
)


def _agenda_params(api_key: str, size: int, from_date: Optional[str], to_date: Optional[str],
                   departments: Optional[Sequence[str]], include_fields: bool) -> list:
    base = [("key", api_key), ("size", str(min(size, PAGE_SIZE))), ("detailed", "1"),
            ("monolingual", "fr")]
    if from_date or to_date:
        if from_date:
            base.append(("timings[gte]", from_date))
        if to_date:
            base.append(("timings[lte]", to_date))
    else:
        base += [("relative[]", "current"), ("relative[]", "upcoming")]
    for code in departments or ():
        base.append(("department[]", DEPARTMENT_NAMES.get(code, code)))
    if include_fields:
        base += [("includeFields[]", f) for f in INCLUDE_FIELDS]
    return base


def fetch_events(
    api_key: Optional[str] = None,
    agenda_uid=None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = PAGE_SIZE,
    max_events: int = MAX_EVENTS_PER_AGENDA,
    client: Optional[PoliteClient] = None,
    departments: Optional[Sequence[str]] = None,
    zone_filter: bool = True,
    include_fields: bool = True,
    stats: Optional[dict] = None,
) -> Generator[dict, None, None]:
    """Current + upcoming events of one agenda. Logs and stops on any HTTP failure.

    departments: server-side `department[]` filter (codes '75', '92'…), for regional
      agendas whose events are mostly outside the service zone.
    zone_filter: drop events located outside 75/92/93/94 (validation would reject them
      anyway) and give up on the agenda when its whole first page is out of zone.
    Called with no agenda_uid → every configured agenda (same as fetch_all()).
    """
    if agenda_uid is None:
        yield from fetch_all(api_key, from_date=from_date, to_date=to_date, limit=limit,
                             max_events=max_events)
        return
    api_key = api_key or os.environ.get("OPENAGENDA_API_KEY", "")
    if not api_key:
        print("  [openagenda] OPENAGENDA_API_KEY missing — skipped")
        return
    stats = stats if stats is not None else {}
    for k in ("requests", "raw", "out_of_zone"):
        stats.setdefault(k, 0)
    own = client is None
    client = client or PoliteClient()
    try:
        base = _agenda_params(api_key, limit, from_date, to_date, departments, include_fields)
        after = None
        offset = 0
        seen = 0
        while seen < max_events:
            params = list(base)
            if after:
                params += [("after[]", str(a)) for a in after]
            elif offset:
                params.append(("from", str(offset)))
            stats["requests"] += 1
            data = client.get_json(f"{API_BASE}/agendas/{agenda_uid}/events", params=params)
            if not data:
                print(f"  [openagenda] agenda {agenda_uid}: no data (HTTP error, see above)")
                return
            events = data.get("events") or []
            if not events:
                return
            kept = events
            if zone_filter:
                zones = [location_zone(e.get("location") or {}) for e in events]
                kept = [e for e, z in zip(events, zones) if z != "out"]
                stats["out_of_zone"] += len(events) - len(kept)
                located = sum(1 for z in zones if z != "unknown")
                if seen == 0 and located >= OUT_OF_ZONE_ABORT_MIN and "in" not in zones:
                    print(f"  [openagenda] agenda {agenda_uid}: first {located} located events all "
                          f"outside 75/92/93/94 — agenda skipped")
                    stats["skipped_out_of_zone"] = True
                    return
            stats["raw"] += len(events)
            for ev in parse_events_page({"events": kept}, agenda_uid=agenda_uid):
                yield ev
            seen += len(events)
            if data.get("after"):
                after = data["after"]
            else:
                offset += len(events)
                if offset >= int(data.get("total") or 0):
                    return
        print(f"  [openagenda] agenda {agenda_uid}: capped at {max_events} events")
    finally:
        if own:
            client.close()


def agendas_for_part(part: Optional[str] = None, agenda_ids: Optional[Sequence] = None) -> List:
    """Agenda UIDs for one half of the split (None → all). Unknown departments go to 'paris'."""
    ids = list(agenda_ids or AGENDA_IDS)
    if not part:
        return ids
    if part not in PARTS:
        raise ValueError(f"unknown part {part!r}; expected one of {sorted(PARTS)}")
    wanted = PARTS[part]
    return [uid for uid in ids if AGENDA_DEPT.get(uid, "75") in wanted]


def fetch_all(api_key: Optional[str] = None, agenda_ids: Optional[Sequence] = None,
              part: Optional[str] = None, **kwargs) -> Generator[dict, None, None]:
    """All configured agendas (or one `part`: 'paris' | 'couronne');
    one agenda failing never stops the others."""
    api_key = api_key or os.environ.get("OPENAGENDA_API_KEY", "")
    if not api_key:
        print("  [openagenda] OPENAGENDA_API_KEY not set — source skipped")
        return
    seen = set()
    ids = agendas_for_part(part, agenda_ids)
    totals = {"agendas": 0, "requests": 0, "events": 0, "out_of_zone": 0, "skipped": 0, "failed": 0}
    print(f"  [openagenda] {len(ids)} agendas (part={part or 'all'})")
    with PoliteClient() as client:
        for uid in ids:
            n = 0
            st: dict = {}
            kw = dict(kwargs)
            if uid in DEPT_FILTER_IDS and "departments" not in kw:
                kw["departments"] = ZONE_DEPARTMENTS
            try:
                for ev in fetch_events(api_key, uid, client=client, stats=st, **kw):
                    if ev["source_id"] in seen:
                        continue  # same event aggregated in several agendas
                    seen.add(ev["source_id"])
                    n += 1
                    yield ev
            except BudgetExceeded:
                print(f"  [openagenda] budget exhausted at agenda {uid} "
                      f"({totals['agendas']}/{len(ids)} done, {totals['events']} events)")
                raise
            except Exception as e:
                totals["failed"] += 1
                print(f"  [openagenda] agenda {uid} failed: {type(e).__name__}: {e}")
                continue
            finally:
                totals["requests"] += st.get("requests", 0)
                totals["out_of_zone"] += st.get("out_of_zone", 0)
            totals["agendas"] += 1
            totals["events"] += n
            totals["skipped"] += 1 if st.get("skipped_out_of_zone") else 0
            print(f"  [openagenda] agenda {uid}: {n} events")
    print(f"  [openagenda] done: {totals}")


def discover_agendas(api_key: str, query: str = "paris", official: bool = True,
                     max_pages: int = 5, size: int = 100) -> List[dict]:
    """Manual helper: search agendas (GET /v2/agendas) to curate openagenda_config.py.
    Without a key, use tools/discover_openagenda.py (public front-end JSON + zone check).

    Returns [{uid, title, slug, official, description}] — review by hand before adding.
    """
    out: List[dict] = []
    params = [("key", api_key), ("search", query), ("size", str(size))]
    if official:
        params.append(("official", "1"))
    after = None
    with PoliteClient() as client:
        for _ in range(max_pages):
            p = list(params) + ([("after[]", str(a)) for a in after] if after else [])
            data = client.get_json(f"{API_BASE}/agendas", params=p)
            if not data:
                break
            for a in data.get("agendas") or []:
                out.append({
                    "uid": a.get("uid"), "title": a.get("title"), "slug": a.get("slug"),
                    "official": a.get("official"), "description": a.get("description"),
                })
            after = data.get("after")
            if not after or not data.get("agendas"):
                break
    return out


if __name__ == "__main__":
    import json

    for i, ev in enumerate(fetch_all(agenda_ids=AGENDA_IDS[:1])):
        print(json.dumps(ev, indent=2, ensure_ascii=False))
        if i >= 2:
            break
