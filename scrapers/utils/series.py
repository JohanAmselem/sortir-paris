"""
Series collapsing: a show listed once per session (each night of a run, each museum
time slot, a weekly "jeudi chanson") becomes ONE event spanning its sessions.

collapse_series(events, source) groups events by (dedup title, venue); a group with
SERIES_MIN or more live sessions is replaced by one event:
  - start = first session, end = last session's end (or start),
  - time_known only when every session has the same known Paris-local time,
  - source_id = "<prefix>-series-<hash(title key, venue key)>", stable across runs.
Cinema sources keep one row per séance (the website groups films itself).

cron.py applies it to every source before ingestion; maintenance.reject_collapsed_series
hides the per-date rows stored before the series row existed.
"""

from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Tuple

from utils.dates import paris_local
from utils.event import stable_id
from utils.matching import dedup_title

SERIES_MIN = 4
# One row per séance on purpose: the web groups films by title itself.
NO_SERIES_SOURCES = frozenset({"allocine", "cinematheque", "forumdesimages", "tmdb"})
SERIES_MARK = "-series-"


def series_key(ev: dict) -> Optional[Tuple[str, str]]:
    title = dedup_title(ev.get("title"))
    venue = (ev.get("venue_name") or "").strip().lower()
    if not title or not venue:
        return None  # never group events without a place
    return title, venue


def is_series_id(source_id: Optional[str]) -> bool:
    return bool(source_id) and SERIES_MARK in source_id


def _local_hhmm(ev: dict) -> Optional[str]:
    dt = paris_local(ev.get("start_date"))
    return dt.strftime("%H:%M") if dt else None


def collapse_series(
    events: Iterable[dict],
    source: Optional[str] = None,
    *,
    id_prefix: Optional[str] = None,
    min_sessions: int = SERIES_MIN,
) -> List[dict]:
    """Return the events with every series (≥ min_sessions sessions) collapsed.
    Order: untouched events in input order, series rows where their first session was."""
    events = list(events)
    if source in NO_SERIES_SOURCES:
        return events
    groups: Dict[Tuple[str, str], List[int]] = {}
    for i, ev in enumerate(events):
        if not ev.get("start_date") or is_series_id(ev.get("source_id")):
            continue
        key = series_key(ev)
        if key:
            groups.setdefault(key, []).append(i)

    replace: Dict[int, dict] = {}
    drop: set = set()
    for (tkey, vkey), idxs in groups.items():
        live = [i for i in idxs if events[i].get("event_status") != "cancelled"]
        if len(live) < min_sessions:
            continue
        live.sort(key=lambda i: events[i]["start_date"])
        first = dict(events[live[0]])
        sessions = [events[i] for i in live]
        last_end = max((e.get("end_date") or e["start_date"]) for e in sessions)
        if last_end > first["start_date"]:
            first["end_date"] = last_end
        times = {_local_hhmm(e) for e in sessions}
        first["time_known"] = bool(all(e.get("time_known") for e in sessions) and len(times) == 1)
        prefix = id_prefix or source or first.get("source") or "src"
        first["source_id"] = f"{prefix}{SERIES_MARK}{stable_id(tkey, vkey)[:16]}"
        first["series_sessions"] = len(sessions)
        replace[live[0]] = first
        drop.update(idxs)  # cancelled sessions of a collapsed series go too
    if not replace:
        return events
    out = []
    for i, ev in enumerate(events):
        if i in replace:
            out.append(replace[i])
        elif i not in drop:
            out.append(ev)
    return out
