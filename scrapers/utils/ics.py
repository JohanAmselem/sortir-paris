"""
Minimal iCalendar (RFC 5545) reader — enough for public venue agendas.
No dependency: unfolds lines, reads VEVENT properties, handles TZID / UTC / VALUE=DATE.
Recurrence rules are NOT expanded (only the first occurrence is used): we never
invent dates from an RRULE.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Dict, Iterator, List, Optional, Tuple
from zoneinfo import ZoneInfo

from utils.event import make_event


def _unfold(text: str) -> List[str]:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"\n[ \t]", "", text).split("\n")


def _unescape(v: str) -> str:
    return (
        v.replace("\\n", "\n").replace("\\N", "\n").replace("\\,", ",")
        .replace("\\;", ";").replace("\\\\", "\\")
    )


def _parse_line(line: str) -> Optional[Tuple[str, Dict[str, str], str]]:
    if ":" not in line:
        return None
    # split name;params:value — the value may contain ':'
    m = re.match(r'^([A-Za-z0-9-]+)((?:;[^:;]+=(?:"[^"]*"|[^:;]*))*):(.*)$', line)
    if not m:
        return None
    name = m.group(1).upper()
    params = {}
    for p in re.findall(r';([^=;:]+)=("[^"]*"|[^;:]*)', m.group(2)):
        params[p[0].upper()] = p[1].strip('"')
    return name, params, m.group(3)


def parse_ics_datetime(value: str, params: Dict[str, str]):
    """→ date (all-day) | aware datetime | naive datetime (floating = Paris local)."""
    value = value.strip()
    if params.get("VALUE") == "DATE" or re.fullmatch(r"\d{8}", value):
        try:
            return date(int(value[:4]), int(value[4:6]), int(value[6:8]))
        except ValueError:
            return None
    m = re.fullmatch(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?", value)
    if not m:
        return None
    try:
        dt = datetime(int(m[1]), int(m[2]), int(m[3]), int(m[4]), int(m[5]), int(m[6] or 0))
    except ValueError:
        return None
    if m[7]:
        return dt.replace(tzinfo=timezone.utc)
    tzid = params.get("TZID")
    if tzid:
        try:
            return dt.replace(tzinfo=ZoneInfo(tzid))
        except Exception:
            return dt  # unknown TZID → floating, i.e. Paris local
    return dt


def iter_vevents(text: str) -> Iterator[Dict[str, Tuple[Dict[str, str], str]]]:
    """Yield one dict per VEVENT: NAME → (params, raw value)."""
    current = None
    depth = 0
    for line in _unfold(text or ""):
        if not line.strip():
            continue
        up = line.strip().upper()
        if up == "BEGIN:VEVENT":
            current = {}
            depth = 0
            continue
        if current is None:
            continue
        if up.startswith("BEGIN:"):
            depth += 1  # VALARM etc.
            continue
        if up.startswith("END:") and up != "END:VEVENT":
            depth -= 1
            continue
        if up == "END:VEVENT":
            yield current
            current = None
            continue
        if depth > 0:
            continue
        parsed = _parse_line(line)
        if parsed:
            name, params, value = parsed
            current.setdefault(name, (params, value))


def event_from_vevent(
    ve: Dict[str, Tuple[Dict[str, str], str]],
    *,
    source: str,
    default_venue: Optional[dict] = None,
    category_slug: Optional[str] = None,
) -> Optional[dict]:
    def val(name):
        item = ve.get(name)
        return _unescape(item[1]).strip() if item else None

    title = val("SUMMARY")
    if not title or "DTSTART" not in ve:
        return None
    start = parse_ics_datetime(ve["DTSTART"][1], ve["DTSTART"][0])
    if start is None:
        return None
    end = None
    if "DTEND" in ve:
        end = parse_ics_datetime(ve["DTEND"][1], ve["DTEND"][0])
        # all-day DTEND is exclusive (next day) → previous day
        if isinstance(end, date) and not isinstance(end, datetime) and isinstance(start, date) \
                and not isinstance(start, datetime):
            from datetime import timedelta
            end = end - timedelta(days=1)
            if end <= start:
                end = None
    dv = default_venue or {}
    location = val("LOCATION")
    venue_name = dv.get("venue_name")
    venue_address = dv.get("venue_address")
    if location and not venue_name:
        parts = [p.strip() for p in location.split(",")]
        venue_name = parts[0]
        venue_address = ", ".join(parts[1:]) or None
    description = val("DESCRIPTION")
    url = val("URL")
    status = (val("STATUS") or "").upper()
    geo = val("GEO")
    lat = lng = None
    if geo and ";" in geo:
        lat, lng = geo.split(";", 1)
    categories = val("CATEGORIES")
    uid = val("UID")
    return make_event(
        source=source,
        source_id=f"{uid}#{ve['DTSTART'][1]}" if uid else None,
        title=title,
        start=start,
        end=end,
        description=description,
        price=None,  # free-text descriptions are not a reliable price source
        source_url=url,
        booking_url=url,
        venue_name=venue_name,
        venue_address=venue_address,
        venue_city=dv.get("venue_city"),
        venue_zip=dv.get("venue_zip"),
        venue_lat=lat or dv.get("venue_lat"),
        venue_lng=lng or dv.get("venue_lng"),
        category_slug=category_slug,
        category_raw=categories,
        tags=[c.strip() for c in (categories or "").split(",") if c.strip()],
        event_status="cancelled" if status == "CANCELLED" else "scheduled",
    )


def events_from_ics(text: str, *, source: str, **kwargs) -> List[dict]:
    out = []
    for ve in iter_vevents(text):
        ev = event_from_vevent(ve, source=source, **kwargs)
        if ev:
            out.append(ev)
    return out
