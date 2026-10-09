"""
Venue linking (post step, before dedup): the same place scraped under several names
("38Riv" / "38Riv Jazz Club" / "38 RIV - Jazz Club & Bar") gets one canonical venue.
Aliases get canonical_venue_id = canonical; nothing is renamed or deleted, so the step
is reversible (UPDATE venues SET canonical_venue_id = NULL).

Two venues are the same place when their postcodes do not conflict (both known and
different → never) and:
  1. same name key (normalize_venue_name, or distinctive tokens without generic words
     such as théâtre / salle / jazz club / & bar), not further than FAR_METERS when both
     are geocoded; a generic key ("mairie", "médiathèque") also needs NEAR_METERS; or
  2. < NEAR_METERS apart AND compatible names (token containment or trigram ≥ 0.5,
     see utils.matching.venue_names_compatible — distinct halls of one complex,
     "<complex> - <hall>", are never merged).
Canonical of a group = most events, then geocoded, then oldest.
Venues already linked (canonical_venue_id set, e.g. by hand) are left as they are.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime
from typing import Dict, Iterable, List, Optional

from utils.matching import (
    VENUE_GENERIC_KEYS,
    haversine_m,
    normalize_venue_name,
    venue_key,
    venue_names_compatible,
)
from utils.normalize import normalize_zip

NEAR_METERS = 60
FAR_METERS = 1500
WRITE_CHUNK = 500


def _geo(v: dict) -> bool:
    return v.get("lat") is not None and v.get("lng") is not None


def _dist(a: dict, b: dict) -> Optional[float]:
    if _geo(a) and _geo(b):
        return haversine_m(a["lat"], a["lng"], b["lat"], b["lng"])
    return None


def zips_conflict(a: dict, b: dict) -> bool:
    za, zb = normalize_zip(a.get("zip_code")), normalize_zip(b.get("zip_code"))
    if not za or not zb or za == zb:
        return False
    # 75116 is the 16e (75016)
    alias = {"75116": "75016"}
    return alias.get(za, za) != alias.get(zb, zb)


def incompatible(a: dict, b: dict) -> bool:
    """Explicit evidence that two venues are different places: conflicting postcodes,
    far apart, or the same spot with names that do not match (Sunset and Sunside, two
    clubs at one address)."""
    if zips_conflict(a, b):
        return True
    d = _dist(a, b)
    if d is not None and d >= FAR_METERS:
        return True
    return d is not None and d < NEAR_METERS and not same_place(a, b)


def same_place(a: dict, b: dict) -> bool:
    if zips_conflict(a, b):
        return False
    d = _dist(a, b)
    ka, kb = a["_key"], b["_key"]
    na, nb = a["_nn"], b["_nn"]
    if (ka and ka == kb) or (na and na == nb and len(na) >= 3):
        key = ka if ka == kb else na.replace(" ", "")
        near = d is not None and d < NEAR_METERS
        if key in VENUE_GENERIC_KEYS:
            return near
        if len(key) < 4:  # "Théâtre 71" → "71": also fine with the same known postcode
            za, zb = normalize_zip(a.get("zip_code")), normalize_zip(b.get("zip_code"))
            return near or bool(za and za == zb and (d is None or d < FAR_METERS))
        return d is None or d < FAR_METERS
    if d is not None and d < NEAR_METERS:
        return venue_names_compatible(a.get("name"), b.get("name"))
    return False


def _rank(v: dict) -> tuple:
    created = v.get("created_at")
    ts = created.timestamp() if isinstance(created, datetime) else 0.0
    return (v.get("n_events") or 0, 1 if _geo(v) else 0, -ts, str(v["id"]))


def _cell(v: dict):
    # ~110 m × ~75 m cells: neighbours cover NEAR_METERS
    return math.floor(float(v["lat"]) / 0.001), math.floor(float(v["lng"]) / 0.0013)


def plan_links(venues: Iterable[dict]) -> Dict[str, str]:
    """Pure: {alias venue id: canonical venue id} for venues not linked yet."""
    rows = [dict(v) for v in venues]
    for v in rows:
        v["_key"] = venue_key(v.get("name"))
        v["_nn"] = normalize_venue_name(v.get("name") or "")
    free = [i for i, v in enumerate(rows) if not v.get("canonical_venue_id")]

    parent = {i: i for i in free}
    members_of: Dict[int, List[int]] = {i: [i] for i in free}

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        """Merge two groups unless some member of one is known to be another place than
        some member of the other (no chaining Sunset ~ "Sunset Sunside" ~ Sunside)."""
        ri, rj = find(i), find(j)
        if ri == rj:
            return
        if any(incompatible(rows[x], rows[y]) for x in members_of[ri] for y in members_of[rj]):
            return
        parent[rj] = ri
        members_of[ri] += members_of.pop(rj)

    by_key: Dict[str, List[int]] = defaultdict(list)
    grid: Dict[tuple, List[int]] = defaultdict(list)
    for i in free:
        v = rows[i]
        for k in {v["_key"], "nn:" + v["_nn"]}:
            if k and k != "nn:":
                by_key[k].append(i)
        if _geo(v):
            grid[_cell(v)].append(i)

    seen = set()

    def consider(i, j):
        pair = (min(i, j), max(i, j))
        if i == j or pair in seen:
            return
        seen.add(pair)
        if same_place(rows[i], rows[j]):
            union(i, j)

    for members in by_key.values():
        if len(members) > 200:  # absurdly common key: not a place name
            continue
        for x in range(len(members)):
            for y in range(x + 1, len(members)):
                consider(members[x], members[y])
    for (ci, cj), members in grid.items():
        neigh = []
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                neigh += grid.get((ci + di, cj + dj), [])
        for i in members:
            for j in neigh:
                consider(i, j)

    groups: Dict[int, List[int]] = defaultdict(list)
    for i in free:
        groups[find(i)].append(i)
    out: Dict[str, str] = {}
    for members in groups.values():
        if len(members) < 2:
            continue
        best = max((rows[i] for i in members), key=_rank)
        for i in members:
            if rows[i]["id"] != best["id"]:
                out[str(rows[i]["id"])] = str(best["id"])
    return out


VENUES_SQL = """
SELECT v.id, v.name, v.zip_code, v.lat, v.lng, v.canonical_venue_id, v.created_at,
       coalesce(n.cnt, 0) AS n_events
FROM venues v
LEFT JOIN (SELECT venue_id, count(*) AS cnt FROM events GROUP BY venue_id) n ON n.venue_id = v.id
"""

LINK_SQL = """
UPDATE venues SET canonical_venue_id = %(canonical)s
WHERE id = %(alias)s AND canonical_venue_id IS NULL AND id <> %(canonical)s
"""


def link_venues(conn) -> int:
    from pipelines.ingest import _exec_many

    with conn.cursor() as cur:
        cur.execute(VENUES_SQL)
        cols = [d[0] for d in cur.description]
        venues = [dict(zip(cols, r)) for r in cur.fetchall()]
        links = plan_links(venues)
        params = [{"alias": a, "canonical": c} for a, c in links.items()]
        for i in range(0, len(params), WRITE_CHUNK):
            _exec_many(cur, LINK_SQL, params[i:i + WRITE_CHUNK])
    conn.commit()
    print(f"[venues] {len(venues)} venues scanned, {len(links)} linked to a canonical venue")
    return len(links)
