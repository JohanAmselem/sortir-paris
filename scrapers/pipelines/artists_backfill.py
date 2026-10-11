"""
Post step "artists": fill event_artists for live music events that have none yet.

New and updated rows get their artists at ingestion (pipelines/ingest.py); this step
covers events stored before that existed, and sources that have not run since. Title
parsing only (utils/artists.extract_artists, origin 'title'): the next ingestion of the
event replaces these rows with the source's own line-up when it has one.

Cost: one read of at most LIMIT candidates (random order, so that events whose title
yields no artist do not starve the others run after run) and one INSERT per CHUNK events.
"""

from __future__ import annotations

from typing import Dict, List

from utils.artists import MUSIC_CATEGORIES, artist_key, extract_artists

LIMIT = 5000
CHUNK = 1000

CANDIDATES_SQL = """
SELECT e.id, e.title, c.slug, v.name
FROM events e
JOIN categories c ON c.id = e.category_id
LEFT JOIN venues v ON v.id = e.venue_id
WHERE e.status = 'active'
  AND c.slug = ANY(%(slugs)s::text[])
  AND COALESCE(e.end_date, e.start_date) >= now()
  AND NOT EXISTS (SELECT 1 FROM event_artists ea WHERE ea.event_id = e.id)
ORDER BY random()
LIMIT %(limit)s
"""

INSERT_SQL = """
INSERT INTO event_artists (event_id, artist_key, name, origin)
SELECT d.event_id, d.artist_key, d.name, 'title'
FROM unnest(%(ids)s::uuid[], %(keys)s::text[], %(names)s::text[]) AS d(event_id, artist_key, name)
ON CONFLICT (event_id, artist_key) DO NOTHING
"""


def plan_rows(candidates) -> Dict[str, List]:
    """(id, title, category slug, venue name) rows → unnest arrays for INSERT_SQL."""
    out: Dict[str, List] = {"ids": [], "keys": [], "names": []}
    for eid, title, slug, venue_name in candidates:
        for name, _origin in extract_artists(title, slug, None, venue_name):
            key = artist_key(name)
            if key:
                out["ids"].append(eid)
                out["keys"].append(key)
                out["names"].append(name[:120])
    return out


def backfill_artists(conn, limit: int = LIMIT, chunk: int = CHUNK) -> dict:
    with conn.cursor() as cur:
        cur.execute(CANDIDATES_SQL, {"slugs": sorted(MUSIC_CATEGORIES), "limit": limit})
        candidates = cur.fetchall()
    conn.commit()
    stats = {"candidates": len(candidates), "events": 0, "rows": 0}
    for i in range(0, len(candidates), chunk):
        rows = plan_rows(candidates[i:i + chunk])
        if not rows["ids"]:
            continue
        with conn.cursor() as cur:
            cur.execute(INSERT_SQL, rows)
            stats["rows"] += max(cur.rowcount or 0, 0)
        conn.commit()
        stats["events"] += len(set(rows["ids"]))
    print(f"  [artists] {stats['candidates']} live music events without artists → "
          f"{stats['events']} events, {stats['rows']} artist rows")
    return stats

