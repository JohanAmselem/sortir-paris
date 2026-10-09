"""
Cross-source event deduplication (AUDIT D11).

Two events are duplicates when they come from different sources, on the same Paris-local
day (or overlapping multi-day ranges), and either:
  - same canonical venue, or venues < 150 m apart, and trigram similarity of their
    normalized dedup titles (dates, COMPLET, editorial tails stripped) > 0.55; or
  - venue rows not linked yet but with compatible names (containment / trigram, postcode
    equal or unknown), same day and time slot (±45 min when both times are known), and
    title similarity ≥ 0.8.

The weaker row gets canonical_event_id = stronger row (see choose_canonical), and the
canonical row's missing fields are filled from the duplicate. Rows are never deleted.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime
from typing import Dict, Iterable, List, Optional, Tuple

from utils.dates import paris_day
from pipelines.ingest import _exec_many
from utils.matching import (
    _trigrams,
    dedup_title,
    haversine_m,
    trigram_similarity,
    venue_names_compatible,
    venue_tokens,
)
from utils.normalize import normalize_zip

TITLE_THRESHOLD = 0.55
NEAR_METERS = 150
# Different venue rows whose names designate the same place (no shared geocode yet):
STRONG_TITLE_THRESHOLD = 0.8
SLOT_MINUTES = 45
FAR_METERS = 1500

# Higher = more trusted. Official venue/open-data feeds beat aggregators.
SOURCE_PRIORITY: Dict[str, int] = {
    "paris_opendata": 90,
    "openagenda": 85,
    "parismusees": 85,
    "ticketmaster": 70,
    "allocine": 65,
    "fnacspectacles": 60,
    "billetreduc": 55,
    "theatreonline": 55,
    "offi": 50,
    "newmorning": 80,
    "parisjazzclub": 50,
    "infoconcert": 45,
    "sortiraparis": 45,
    "timeout": 45,
    "quefaire_paris": 45,
    "paris_fr": 45,
    "mapado": 40,
    "dice": 45,
    "shotgun": 45,
    "bandsintown": 40,
    "eventbrite": 35,
    "meetup": 30,
    "lebonbon": 25,
}
VENUE_SOURCE_PRIORITY = 95  # "venue_<key>" sources = the venue's own website


def source_priority(source: str) -> int:
    if source and source.startswith("venue_"):
        return VENUE_SOURCE_PRIORITY
    return SOURCE_PRIORITY.get(source, 30)


def canonical_rank(row: dict) -> tuple:
    """Sort key: the max is the canonical row."""
    created = row.get("created_at")
    created_ts = created.timestamp() if isinstance(created, datetime) else 0
    return (
        1 if row.get("status") == "active" else 0,
        source_priority(row.get("source", "")),
        row.get("quality_score") or 0,
        -created_ts,  # older first-seen wins ties
        str(row.get("id")),
    )


def choose_canonical(a: dict, b: dict) -> Tuple[dict, dict]:
    """Return (canonical, duplicate)."""
    return (a, b) if canonical_rank(a) >= canonical_rank(b) else (b, a)


def _days(row: dict) -> Tuple[Optional[date], Optional[date]]:
    s = row.get("_day_start")
    if s is None:
        s = paris_day(row.get("start_date"))
        e = paris_day(row.get("end_date")) if row.get("end_date") else s
        row["_day_start"], row["_day_end"] = s, (e if e and s and e >= s else s)
    return row["_day_start"], row["_day_end"]


def dates_match(a: dict, b: dict) -> bool:
    sa, ea = _days(a)
    sb, eb = _days(b)
    if not sa or not sb:
        return False
    return sa <= eb and sb <= ea


def venues_match(a: dict, b: dict) -> bool:
    va, vb = a.get("canonical_venue"), b.get("canonical_venue")
    if va and vb and va == vb:
        return True
    if None not in (a.get("lat"), a.get("lng"), b.get("lat"), b.get("lng")):
        return haversine_m(a["lat"], a["lng"], b["lat"], b["lng"]) < NEAR_METERS
    return False


def venue_names_match(a: dict, b: dict) -> bool:
    """Two venue rows that are probably the same place: compatible names, postcodes equal
    or one unknown, and not geocoded far apart."""
    za, zb = normalize_zip(a.get("zip_code")), normalize_zip(b.get("zip_code"))
    if za and zb and za != zb:
        return False
    if None not in (a.get("lat"), a.get("lng"), b.get("lat"), b.get("lng")):
        if haversine_m(a["lat"], a["lng"], b["lat"], b["lng"]) > FAR_METERS:
            return False
    return venue_names_compatible(a.get("venue_name"), b.get("venue_name"))


def same_slot(a: dict, b: dict) -> bool:
    """Same Paris day, and starts within SLOT_MINUTES when both times are known."""
    sa, sb = _days(a)[0], _days(b)[0]
    if not sa or sa != sb:
        return False
    if a.get("time_known") and b.get("time_known"):
        da, db = a.get("start_date"), b.get("start_date")
        if isinstance(da, datetime) and isinstance(db, datetime):
            return abs((da - db).total_seconds()) <= SLOT_MINUTES * 60
    return True


def _title_sim(a: dict, b: dict) -> float:
    ga, gb = a.get("_tg"), b.get("_tg")
    if ga is None or gb is None:
        ta = a.get("_dt") or dedup_title(a.get("title"))
        tb = b.get("_dt") or dedup_title(b.get("title"))
        return trigram_similarity(ta, tb)
    if not ga or not gb:
        return 0.0
    return len(ga & gb) / len(ga | gb)


def is_duplicate(a: dict, b: dict) -> bool:
    if a.get("source") == b.get("source"):
        return False
    if not dates_match(a, b):
        return False
    if venues_match(a, b):
        return _title_sim(a, b) > TITLE_THRESHOLD
    # venue rows not linked/geocoded yet ("Seine Musicale" / "La Seine Musicale"):
    # stricter title and same time slot
    return (same_slot(a, b) and _title_sim(a, b) >= STRONG_TITLE_THRESHOLD
            and venue_names_match(a, b))


def _cells(row: dict) -> List[tuple]:
    keys = []
    start_day, end_day = _days(row)
    if start_day and start_day == end_day and row.get("venue_name"):
        # same day + a distinctive venue word: candidates for venue_names_match
        toks = row.setdefault("_vt", venue_tokens(row.get("venue_name")))
        for tok in toks + ["".join(sorted(toks))]:  # "38Riv" and "38 RIV" share the compact key
            if tok:
                keys.append(("n", start_day, tok))
    if row.get("canonical_venue"):
        keys.append(("v", row["canonical_venue"]))
    if row.get("lat") is not None and row.get("lng") is not None:
        ci = math.floor(float(row["lat"]) / 0.0015)
        cj = math.floor(float(row["lng"]) / 0.0022)
        keys.append(("g", ci, cj))
    return keys


def find_duplicates(rows: Iterable[dict]) -> Dict[str, str]:
    """Return {duplicate_id: canonical_id} for a set of candidate rows."""
    rows = [r for r in rows if r.get("start_date")]
    for r in rows:
        r["_dt"] = dedup_title(r.get("title"))
        r["_tg"] = frozenset(_trigrams(r["_dt"]))  # computed once, not per pair
    buckets: Dict[tuple, List[int]] = defaultdict(list)
    for idx, r in enumerate(rows):
        for k in _cells(r):
            buckets[k].append(idx)

    parent = list(range(len(rows)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    seen_pairs = set()
    for key, members in buckets.items():
        if key[0] == "n" and len(members) > 300:
            continue  # a venue word shared by hundreds of events that day is not distinctive
        candidates = list(members)
        if key[0] == "g":  # add neighbouring geo cells
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    if di or dj:
                        candidates += buckets.get(("g", key[1] + di, key[2] + dj), [])
        for x in members:
            for y in candidates:
                if x == y or rows[x].get("source") == rows[y].get("source"):
                    continue  # same-source rows are never duplicates: skip before bookkeeping
                pair = (min(x, y), max(x, y))
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                if is_duplicate(rows[x], rows[y]):
                    rx, ry = find(x), find(y)
                    if rx != ry:
                        parent[ry] = rx

    groups: Dict[int, List[int]] = defaultdict(list)
    for i in range(len(rows)):
        groups[find(i)].append(i)

    out: Dict[str, str] = {}
    for members in groups.values():
        if len(members) < 2:
            continue
        pool = members
        per_source = defaultdict(int)
        for i in members:
            per_source[rows[i].get("source")] += 1
        if any(n > 1 for n in per_source.values()):
            # several sessions of one source joined through a run/series row of another:
            # the run is what is displayed, never one session hiding the others
            ranged = [i for i in members if _days(rows[i])[0] != _days(rows[i])[1]]
            pool = ranged or members
        best = max((rows[i] for i in pool), key=canonical_rank)
        for i in members:
            if rows[i]["id"] != best["id"]:
                out[str(rows[i]["id"])] = str(best["id"])
    return out


FILL_SQL = """
UPDATE events c SET
    image_url   = COALESCE(c.image_url, d.image_url),
    short_desc  = COALESCE(c.short_desc, d.short_desc),
    description = CASE WHEN length(coalesce(c.description, '')) < 80
                        AND length(coalesce(d.description, '')) > length(coalesce(c.description, ''))
                       THEN d.description ELSE c.description END,
    booking_url = COALESCE(c.booking_url, d.booking_url),
    category_id = COALESCE(c.category_id, d.category_id),
    venue_id    = COALESCE(c.venue_id, d.venue_id),
    price_min   = CASE WHEN c.price_status = 'unknown' AND d.price_status <> 'unknown' THEN d.price_min ELSE c.price_min END,
    price_max   = CASE WHEN c.price_status = 'unknown' AND d.price_status <> 'unknown' THEN d.price_max ELSE c.price_max END,
    is_free     = CASE WHEN c.price_status = 'unknown' AND d.price_status <> 'unknown' THEN d.is_free ELSE c.is_free END,
    price_status = CASE WHEN c.price_status = 'unknown' AND d.price_status <> 'unknown' THEN d.price_status ELSE c.price_status END,
    start_date  = CASE WHEN NOT c.time_known AND d.time_known
                        AND (c.start_date AT TIME ZONE 'Europe/Paris')::date = (d.start_date AT TIME ZONE 'Europe/Paris')::date
                        AND (c.end_date IS NULL OR c.end_date >= d.start_date)
                       THEN d.start_date ELSE c.start_date END,
    time_known  = c.time_known OR (d.time_known
                        AND (c.start_date AT TIME ZONE 'Europe/Paris')::date = (d.start_date AT TIME ZONE 'Europe/Paris')::date
                        AND (c.end_date IS NULL OR c.end_date >= d.start_date)),
    updated_at  = now()
FROM events d
WHERE c.id = %(canonical)s AND d.id = %(dup)s
"""


MARK_SQL = "UPDATE events SET canonical_event_id = %(canonical)s, updated_at = now() WHERE id = %(dup)s AND id <> %(canonical)s"
# rows that pointed at the (now) duplicate follow it to the canonical
FOLLOW_SQL = "UPDATE events SET canonical_event_id = %(canonical)s WHERE canonical_event_id = %(dup)s"


def run_dedup(conn) -> int:
    """Find and mark cross-source duplicates among live events. Returns #rows marked."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT e.id, e.source, e.title, e.start_date, e.end_date, e.status,
               e.quality_score, e.created_at,
               COALESCE(v.canonical_venue_id, v.id) AS canonical_venue,
               COALESCE(c.lat, v.lat) AS lat, COALESCE(c.lng, v.lng) AS lng,
               COALESCE(c.name, v.name) AS venue_name, COALESCE(c.zip_code, v.zip_code) AS zip_code,
               e.time_known
        FROM events e
        JOIN venues v ON v.id = e.venue_id
        LEFT JOIN venues c ON c.id = v.canonical_venue_id
        WHERE e.status IN ('active', 'draft')
          AND e.canonical_event_id IS NULL
          AND coalesce(e.end_date, e.start_date) >= now() - interval '6 hours'
        """
    )
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    mapping = find_duplicates(rows)
    # Batched: a few round trips per 200 duplicates instead of 5 per duplicate.
    items = [{"canonical": c, "dup": d} for d, c in mapping.items()]
    marked = 0
    for i in range(0, len(items), 200):
        chunk = items[i:i + 200]
        cur.execute("SAVEPOINT dedup")
        try:
            _exec_many(cur, FILL_SQL, chunk)
            _exec_many(cur, MARK_SQL, chunk)
            _exec_many(cur, FOLLOW_SQL, chunk)
            cur.execute("RELEASE SAVEPOINT dedup")
            marked += len(chunk)
            continue
        except Exception:
            cur.execute("ROLLBACK TO SAVEPOINT dedup")
        for p in chunk:  # replay one by one so a bad pair does not block the batch
            cur.execute("SAVEPOINT dedup")
            try:
                for sql in (FILL_SQL, MARK_SQL, FOLLOW_SQL):
                    cur.execute(sql, p)
                cur.execute("RELEASE SAVEPOINT dedup")
                marked += 1
            except Exception as e:
                cur.execute("ROLLBACK TO SAVEPOINT dedup")
                print(f"  [dedup] {p['dup']} → {p['canonical']} failed: {e}")
    conn.commit()
    cur.close()
    print(f"[dedup] {len(rows)} live events scanned, {marked} marked as duplicates")
    return marked
