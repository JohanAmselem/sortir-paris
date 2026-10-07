"""
Date/time helpers — ONE place for timezones and French date parsing.

Rules (see AUDIT D6):
- A naive datetime is Paris local time (Europe/Paris), never UTC.
- An aware datetime is converted to UTC.
- A date without time is stored at 12:00 Paris local (stays on the right day in
  every timezone) and flagged time_known=False.
- An end date without time is stored at 23:59 Paris local.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional, Tuple, Union
from zoneinfo import ZoneInfo

from dateutil import parser as dateutil_parser
from unidecode import unidecode

PARIS = ZoneInfo("Europe/Paris")
UTC = timezone.utc
UNKNOWN_TIME = time(12, 0)
END_OF_DAY = time(23, 59)

_DATE_ONLY_RE = re.compile(r"^\s*\d{4}-\d{2}-\d{2}\s*$")

DateLike = Union[str, datetime, date, None]


# ─────────────────────────── timezone helpers ───────────────────────────

def _parse_iso(value: str) -> Optional[Union[datetime, date]]:
    value = value.strip()
    if not value:
        return None
    if _DATE_ONLY_RE.match(value):
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    try:
        return dateutil_parser.isoparse(value)
    except (ValueError, OverflowError):
        pass
    try:
        # e.g. "2026-10-25 20:00:00" or RFC-ish strings
        return dateutil_parser.parse(value)
    except (ValueError, OverflowError):
        return None


def to_utc_paris(value: DateLike, *, date_only_time: time = UNKNOWN_TIME) -> Optional[datetime]:
    """Convert anything date-like to an aware UTC datetime.

    - naive datetime / naive ISO string  → interpreted as Europe/Paris local time
    - aware datetime / ISO with offset   → converted to UTC
    - date / "YYYY-MM-DD"                → `date_only_time` (default 12:00) Paris local
    """
    if value is None:
        return None
    if isinstance(value, str):
        value = _parse_iso(value)
        if value is None:
            return None
    if isinstance(value, datetime):
        if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
            value = value.replace(tzinfo=PARIS)
        return value.astimezone(UTC)
    if isinstance(value, date):
        return datetime.combine(value, date_only_time, tzinfo=PARIS).astimezone(UTC)
    return None


def is_date_only(value: DateLike) -> bool:
    if isinstance(value, datetime):
        return False
    if isinstance(value, date):
        return True
    if isinstance(value, str):
        return bool(_DATE_ONLY_RE.match(value))
    return False


def normalize_when(
    value: DateLike,
    *,
    is_end: bool = False,
    midnight_unknown: bool = False,
) -> Tuple[Optional[str], bool]:
    """Return (ISO-8601 UTC string, time_known) for a start or end value.

    midnight_unknown: some sources encode "no time" as 00:00 local — treat it as unknown.
    """
    if value is None or value == "":
        return None, False
    parsed = _parse_iso(value) if isinstance(value, str) else value
    if parsed is None:
        return None, False
    date_only = is_date_only(parsed)
    if not date_only and midnight_unknown and isinstance(parsed, datetime):
        local = parsed if parsed.tzinfo is None else parsed.astimezone(PARIS)
        if local.hour == 0 and local.minute == 0 and local.second == 0:
            parsed = local.date()
            date_only = True
    dt = to_utc_paris(parsed, date_only_time=END_OF_DAY if is_end else UNKNOWN_TIME)
    if dt is None:
        return None, False
    return dt.isoformat(), not date_only


def paris_local(value: DateLike) -> Optional[datetime]:
    dt = to_utc_paris(value)
    return dt.astimezone(PARIS) if dt else None


def paris_day(value: DateLike) -> Optional[date]:
    dt = paris_local(value)
    return dt.date() if dt else None


def now_paris() -> datetime:
    return datetime.now(PARIS)


# ─────────────────────────── French date parser ───────────────────────────

MONTHS = {
    "janvier": 1, "janv": 1, "jan": 1,
    "fevrier": 2, "fevr": 2, "fev": 2,
    "mars": 3, "mar": 3,
    "avril": 4, "avr": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7, "juil": 7,
    "aout": 8,
    "septembre": 9, "sept": 9, "sep": 9,
    "octobre": 10, "oct": 10,
    "novembre": 11, "nov": 11,
    "decembre": 12, "dec": 12,
}
_MONTH_ALT = "|".join(sorted(MONTHS, key=len, reverse=True))
_MONTH_RE = rf"(?P<month>{_MONTH_ALT})\b\.?"

_TEXT_DATE_RE = re.compile(rf"\b(?P<day>\d{{1,2}})\s*(?:er)?\s+{_MONTH_RE}(?:\s+(?P<year>\d{{4}}))?")
_NUM_DATE_RE = re.compile(r"(?<![\d:])(?P<day>\d{1,2})[/.](?P<month>\d{1,2})(?:[/.](?P<year>\d{4}|\d{2}))?(?![\d:])")
_ISO_DATE_RE = re.compile(r"\b(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})\b")
# "25 et 26 octobre", "du 3 au 5 octobre", "3-5 oct"
_BARE_DAY_RE = re.compile(
    rf"\b(?P<day>\d{{1,2}})\s*(?:er)?\s*(?:et|au|&|-|–|,)\s*(?=\d{{1,2}}\s*(?:er)?\s+(?:{_MONTH_ALT})\b)"
)
_TIME_RE = re.compile(r"(?<![\d/.:])(?P<h>\d{1,2})\s*(?:h|:)\s*(?P<m>\d{2})?(?![\d/])")
_DURATION_BEFORE_RE = re.compile(r"(dur[eé]e|dure|pendant|environ|\()\s*:?\s*$")
_DURATION_AFTER_RE = re.compile(r"^\s*(min\b|minutes|de spectacle|de film|env)")
_UNTIL_RE = re.compile(r"(jusqu'?\s*au|jusqu au|until|prolong\w* jusqu)\s*$")
_TIME_LEAD_RE = re.compile(r"(\ba|\bdes|\bde|\bdebut|\bouverture|\bportes|\bfrom|\bat|[,|•·@-])\s*$")


@dataclass
class FrDate:
    start: Optional[datetime]  # naive Paris local; None if only "jusqu'au …" was given
    end: Optional[datetime]  # naive Paris local or None
    time_known: bool
    end_time_known: bool = False

    def to_fields(self) -> dict:
        """Event dict fields: start_date / end_date ISO UTC + time_known."""
        start_iso = end_iso = None
        if self.start is not None:
            value = self.start if self.time_known else self.start.date()
            start_iso, _ = normalize_when(value)
        if self.end is not None:
            value = self.end if self.end_time_known else self.end.date()
            end_iso, _ = normalize_when(value, is_end=True)
        return {"start_date": start_iso, "end_date": end_iso, "time_known": self.time_known}


def _norm(text: str) -> str:
    t = unidecode(text).lower()
    t = re.sub(r"\b1er\b", "1", t)
    t = t.replace(" ", " ")
    return re.sub(r"\s+", " ", t)


def _safe_date(y: int, m: int, d: int) -> Optional[date]:
    try:
        return date(y, m, d)
    except ValueError:
        return None


def _infer_year(month: int, day: int, today: date, grace_days: int = 30) -> int:
    y = today.year
    d = _safe_date(y, month, day)
    if d is None:  # 29 Feb in a non-leap year → try next year
        return y + 1
    if d < today - timedelta(days=grace_days):
        return y + 1
    return y


def _find_date_tokens(t: str):
    """Return list of (pos, day, month, year|None, preceding_text)."""
    tokens = []
    taken = []

    def overlaps(a, b):
        return any(not (b <= s or a >= e) for s, e in taken)

    for m in _ISO_DATE_RE.finditer(t):
        tokens.append((m.start(), int(m["day"]), int(m["month"]), int(m["year"])))
        taken.append(m.span())
    for m in _TEXT_DATE_RE.finditer(t):
        if overlaps(*m.span()):
            continue
        year = int(m["year"]) if m["year"] else None
        tokens.append((m.start(), int(m["day"]), MONTHS[m["month"]], year))
        taken.append(m.span())
    for m in _NUM_DATE_RE.finditer(t):
        if overlaps(*m.span()):
            continue
        month = int(m["month"])
        if not 1 <= month <= 12:
            continue
        year = None
        if m["year"]:
            year = int(m["year"])
            if year < 100:
                year += 2000
        tokens.append((m.start(), int(m["day"]), month, year))
        taken.append(m.span())
    # bare days that borrow month/year from the following token
    for m in _BARE_DAY_RE.finditer(t):
        if overlaps(m.start(), m.start() + len(m["day"])):
            continue
        nxt = _TEXT_DATE_RE.match(t, m.end())
        if not nxt:
            continue
        year = int(nxt["year"]) if nxt["year"] else None
        tokens.append((m.start(), int(m["day"]), MONTHS[nxt["month"]], year))
        taken.append((m.start(), m.start() + len(m["day"])))
    tokens.sort(key=lambda x: x[0])
    return tokens, taken


def _find_times(t: str, taken_spans) -> list:
    times = []
    for m in _TIME_RE.finditer(t):
        if any(not (m.end() <= s or m.start() >= e) for s, e in taken_spans):
            continue
        h = int(m["h"])
        mins = int(m["m"]) if m["m"] else 0
        if h > 23 or mins > 59:
            continue
        # "20:30" needs minutes; "20h" alone is fine
        sep = t[m.start(): m.end()]
        if ":" in sep and m["m"] is None:
            continue
        before = t[max(0, m.start() - 14): m.start()]
        after = t[m.end(): m.end() + 14]
        if _DURATION_BEFORE_RE.search(before) or _DURATION_AFTER_RE.match(after):
            continue
        if h < 6 and not _TIME_LEAD_RE.search(before):
            # "1h30" / "2h" without "à" in front is a duration, not a start time
            continue
        times.append((m.start(), h, mins))
    return times


def parse_date_fr(text: Optional[str], today: Optional[date] = None) -> Optional[FrDate]:
    """Parse a French date / date range string.

    Handles: "le 25 octobre 2026 à 20h30", "du 15 oct. au 10 janv.", "15/10/2026 20:00",
    "Le 25 et 26 octobre", "jusqu'au 12 janvier", "mercredi 9 avril - 21h",
    year inference + rollover, and ignores durations like "1h30".
    Returns naive Paris-local datetimes. None if no date found.
    """
    if not text:
        return None
    today = today or now_paris().date()
    t = _norm(text)
    tokens, taken = _find_date_tokens(t)
    if not tokens:
        return None

    first = tokens[0]
    last = tokens[-1]
    until_only = len(tokens) == 1 and bool(_UNTIL_RE.search(t[: first[0]]))

    def resolve_single(tok) -> Optional[date]:
        _, d, m, y = tok
        if y is None:
            y = _infer_year(m, d, today)
        return _safe_date(y, m, d)

    if len(tokens) == 1 or (first[1:] == last[1:]):
        start_d = resolve_single(first)
        end_d = None
    else:
        _, d1, m1, y1 = first
        _, d2, m2, y2 = last
        if y2 is None:
            y2 = y1 if y1 is not None else _infer_year(m2, d2, today)
            if y1 is not None and (m2, d2) < (m1, d1):
                y2 = y1 + 1  # "du 15 oct. 2026 au 10 janv." → janvier 2027
        if y1 is None:
            y1 = y2
            if (m1, d1) > (m2, d2):
                y1 = y2 - 1  # "du 15 oct au 10 janv 2027" → octobre 2026
        start_d = _safe_date(y1, m1, d1)
        end_d = _safe_date(y2, m2, d2)
        if start_d and end_d and end_d < start_d:
            end_d = None

    if start_d is None:
        return None

    times = _find_times(t, taken)
    time_known = bool(times)
    start_dt = datetime.combine(start_d, time(times[0][1], times[0][2]) if times else time(0, 0))
    end_dt = None
    end_time_known = False
    if end_d is not None:
        end_dt = datetime.combine(end_d, time(0, 0))
    if len(times) >= 2:
        h, mi = times[1][1], times[1][2]
        base = end_d or start_d
        cand = datetime.combine(base, time(h, mi))
        if cand <= start_dt and end_d is None:
            cand += timedelta(days=1)  # "de 22h à 2h" → ends next day
        if cand > start_dt:
            end_dt = cand
            end_time_known = True

    if until_only:
        return FrDate(start=None, end=datetime.combine(start_d, time(0, 0)), time_known=False)
    return FrDate(start=start_dt, end=end_dt, time_known=time_known, end_time_known=end_time_known)


def parse_time_fr(text: Optional[str]) -> Optional[time]:
    """Extract a start time ('20h30', '20:30', 'à 21h') ignoring durations."""
    if not text:
        return None
    t = _norm(text)
    times = _find_times(t, [])
    if not times:
        return None
    return time(times[0][1], times[0][2])
