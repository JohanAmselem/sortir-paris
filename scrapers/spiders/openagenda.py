"""
OpenAgenda API spider.
Source: https://openagenda.com — official API v2: https://developers.openagenda.com/
Legal basis: official API (needs OPENAGENDA_API_KEY, free "public key" from an
OpenAgenda account). Agenda list: spiders/openagenda_config.py.

Endpoints used:
  GET https://api.openagenda.com/v2/agendas/{agendaUID}/events
      ?key=…&size=…&detailed=1&monolingual=fr&relative[]=current&relative[]=upcoming
      (pagination: `after[]` cursor returned by the previous page)
  GET https://api.openagenda.com/v2/agendas?key=…&search=…&official=1   (discover_agendas)

Event shape (validated against the public events.v2.json export, 2026-10-07):
  title/description/longDescription/conditions: {lang: text} (or plain str with monolingual)
  timings: [{begin, end}] ISO with offset · location: {name, address, city, postalCode,
  latitude, longitude, website} · registration: [{type: link|email|phone, value}]
  attendanceMode: 1 offline, 2 online, 3 mixed · status: 1 scheduled, 2 rescheduled,
  3 moved online, 4 postponed, 5 full, 6 cancelled · image: {base, filename}
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Generator, Iterable, List, Optional, Sequence, Tuple

from spiders.openagenda_config import AGENDA_IDS  # re-exported for run.py
from utils.dates import PARIS, to_utc_paris
from utils.event import make_event
from utils.http import BudgetExceeded, PoliteClient
from utils.normalize import parse_price_fr

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
    "AGENDA_IDS", "fetch_events", "fetch_all", "discover_agendas",
    "parse_event", "parse_events_page", "select_occurrence",
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
        venue_zip=loc.get("postalCode"),
        venue_lat=loc.get("latitude"),
        venue_lng=loc.get("longitude"),
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

def fetch_events(
    api_key: Optional[str] = None,
    agenda_uid=None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = 100,
    max_events: int = 3000,
    client: Optional[PoliteClient] = None,
) -> Generator[dict, None, None]:
    """Current + upcoming events of one agenda. Logs and stops on any HTTP failure.

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
    own = client is None
    client = client or PoliteClient()
    try:
        base = [("key", api_key), ("size", str(min(limit, 300))), ("detailed", "1"),
                ("monolingual", "fr")]
        if from_date or to_date:
            if from_date:
                base.append(("timings[gte]", from_date))
            if to_date:
                base.append(("timings[lte]", to_date))
        else:
            base += [("relative[]", "current"), ("relative[]", "upcoming")]
        after = None
        offset = 0
        seen = 0
        while seen < max_events:
            params = list(base)
            if after:
                params += [("after[]", str(a)) for a in after]
            elif offset:
                params.append(("from", str(offset)))
            data = client.get_json(f"{API_BASE}/agendas/{agenda_uid}/events", params=params)
            if not data:
                print(f"  [openagenda] agenda {agenda_uid}: no data (HTTP error, see above)")
                return
            events = data.get("events") or []
            if not events:
                return
            for ev in parse_events_page(data, agenda_uid=agenda_uid):
                yield ev
            seen += len(events)
            if data.get("after"):
                after = data["after"]
            else:
                offset += len(events)
                if offset >= int(data.get("total") or 0):
                    return
    finally:
        if own:
            client.close()


def fetch_all(api_key: Optional[str] = None, agenda_ids: Optional[Sequence] = None,
              **kwargs) -> Generator[dict, None, None]:
    """All configured agendas; one agenda failing never stops the others."""
    api_key = api_key or os.environ.get("OPENAGENDA_API_KEY", "")
    if not api_key:
        print("  [openagenda] OPENAGENDA_API_KEY not set — source skipped")
        return
    seen = set()
    with PoliteClient() as client:
        for uid in agenda_ids or AGENDA_IDS:
            n = 0
            try:
                for ev in fetch_events(api_key, uid, client=client, **kwargs):
                    if ev["source_id"] in seen:
                        continue  # same event aggregated in several agendas
                    seen.add(ev["source_id"])
                    n += 1
                    yield ev
            except BudgetExceeded:
                raise
            except Exception as e:
                print(f"  [openagenda] agenda {uid} failed: {type(e).__name__}: {e}")
                continue
            print(f"  [openagenda] agenda {uid}: {n} events")


def discover_agendas(api_key: str, query: str = "paris", official: bool = True,
                     max_pages: int = 5, size: int = 100) -> List[dict]:
    """Manual helper: search agendas (GET /v2/agendas) to curate openagenda_config.py.

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
