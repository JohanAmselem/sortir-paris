"""
End-of-run maintenance steps (run once after all sources, before the Meilisearch sync).
"""

from __future__ import annotations

from datetime import timedelta

from validation import HARD_REASONS

EXPIRE_SQL = """
UPDATE events
SET status = 'expired', updated_at = now()
WHERE status IN ('active', 'draft')
  AND coalesce(end_date, start_date + interval '3 hours') < now() - interval '6 hours'
"""

# Draft events penalised only because their venue had no coordinates yet: once geocoding
# (or linking to a geocoded canonical venue) succeeded, give the 15 points back and publish
# when the score reaches the threshold.
PROMOTE_SQL = """
UPDATE events e
SET quality_score = LEAST(100, e.quality_score + 15),
    quality_reasons = e.quality_reasons - 'venue_not_geocoded',
    status = CASE WHEN e.status = 'draft' AND e.quality_score + 15 >= 50
                       AND NOT EXISTS (
                         SELECT 1 FROM jsonb_array_elements_text(e.quality_reasons) r
                         WHERE r.value IN (%s)
                       )
                  THEN 'active' ELSE e.status END,
    updated_at = now()
FROM venues v
LEFT JOIN venues c ON c.id = v.canonical_venue_id
WHERE v.id = e.venue_id
  AND coalesce(c.lat, v.lat) IS NOT NULL  -- an alias inherits its canonical venue's position
  AND e.quality_reasons ? 'venue_not_geocoded'
  AND e.status IN ('draft', 'active')
""" % ", ".join(f"'{r}'" for r in HARD_REASONS + ("series_collapsed",))  # see _hard_list()


def expire_events(conn) -> int:
    with conn.cursor() as cur:
        cur.execute(EXPIRE_SQL)
        n = cur.rowcount
    conn.commit()
    print(f"[expire] {n} events marked expired")
    return n


def promote_geocoded(conn) -> int:
    with conn.cursor() as cur:
        cur.execute(PROMOTE_SQL)
        n = cur.rowcount
    conn.commit()
    print(f"[promote] {n} events re-scored after venue geocoding")
    return n


# Ended events are kept 60 days (event pages answer "terminé" + suggestions,
# reviews can still be written), then deleted. Events that members interacted
# with are kept: deleting them would cascade to saves, reviews and outings.
PURGE_SQL = """
DELETE FROM events e
WHERE e.status IN ('expired', 'rejected', 'cancelled')
  AND coalesce(e.end_date, e.start_date) < now() - interval '60 days'
  AND NOT EXISTS (SELECT 1 FROM user_saves s WHERE s.event_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM user_attendances a WHERE a.event_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM event_reviews r WHERE r.event_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM events c WHERE c.canonical_event_id = e.id AND c.status = 'active')
"""


def purge_old_events(conn) -> int:
    with conn.cursor() as cur:
        cur.execute(PURGE_SQL)
        n = cur.rowcount
    conn.commit()
    print(f"[purge] {n} old ended events deleted")
    return n


def _hard_list() -> str:
    return ", ".join(f"'{r}'" for r in HARD_REASONS + ("series_collapsed",))


WRITE_CHUNK = 500

# ─────────────────────────── series (utils/series.py) ───────────────────────────

# Per-date rows stored before their series row existed are hidden (reversible: status
# only, reason "series_collapsed"). Rows members interacted with are left alone.
REJECT_SERIES_SQL = """
UPDATE events e
SET status = 'rejected',
    quality_reasons = CASE WHEN e.quality_reasons ? 'series_collapsed' THEN e.quality_reasons
                           ELSE e.quality_reasons || '["series_collapsed"]'::jsonb END,
    updated_at = now()
WHERE e.id = ANY(%(ids)s::uuid[])
  AND e.status IN ('active', 'draft')
  AND NOT EXISTS (SELECT 1 FROM user_saves s WHERE s.event_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM user_attendances a WHERE a.event_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM event_reviews r WHERE r.event_id = e.id)
"""

SERIES_ROWS_SQL = """
SELECT e.id, e.source, e.source_id, e.title, e.start_date, e.end_date,
       COALESCE(v.canonical_venue_id, v.id) AS venue
FROM events e
JOIN venues v ON v.id = e.venue_id
WHERE e.status IN ('active', 'draft')
  AND coalesce(e.end_date, e.start_date) >= now() - interval '6 hours'
  AND e.source IN (SELECT DISTINCT source FROM events
                   WHERE source_id LIKE %(pattern)s AND status IN ('active', 'draft'))
"""


def collapsed_session_ids(rows) -> list:
    """Pure: ids of per-date rows covered by a live series row of the same source,
    venue and (dedup) title, dated before the series' last session + 1 day."""
    from utils.matching import dedup_title
    from utils.series import is_series_id

    groups: dict = {}
    for r in rows:
        key = (r["source"], str(r["venue"]), dedup_title(r["title"]))
        groups.setdefault(key, []).append(r)
    out = []
    for members in groups.values():
        series = [r for r in members if is_series_id(r["source_id"])]
        if not series:
            continue
        last = max((s["end_date"] or s["start_date"]) for s in series) + timedelta(days=1)
        out += [str(r["id"]) for r in members
                if not is_series_id(r["source_id"]) and r["start_date"] <= last]
    return out


def reject_collapsed_series(conn) -> int:
    from utils.series import SERIES_MARK

    with conn.cursor() as cur:
        cur.execute(SERIES_ROWS_SQL, {"pattern": f"%{SERIES_MARK}%"})
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        ids = collapsed_session_ids(rows)
        n = 0
        for i in range(0, len(ids), WRITE_CHUNK):
            cur.execute(REJECT_SERIES_SQL, {"ids": ids[i:i + WRITE_CHUNK]})
            n += cur.rowcount
    conn.commit()
    print(f"[series] {len(rows)} live rows scanned, {n} per-date rows hidden behind their series")
    return n


# ─────────────────────────── categories ───────────────────────────

CATEGORY_ROWS_SQL = """
SELECT e.id, e.title, e.description, c.slug
FROM events e
LEFT JOIN categories c ON c.id = e.category_id
WHERE e.status IN ('active', 'draft')
  AND coalesce(e.end_date, e.start_date) >= now() - interval '6 hours'
"""

SET_CATEGORY_SQL = """
UPDATE events e
SET category_id = %(category_id)s::uuid,
    quality_score = CASE WHEN e.quality_reasons ? 'no_category' THEN LEAST(100, e.quality_score + 10)
                         ELSE e.quality_score END,
    quality_reasons = e.quality_reasons - 'no_category',
    status = CASE WHEN e.status = 'draft' AND e.quality_reasons ? 'no_category'
                       AND e.quality_score + 10 >= 50
                       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(e.quality_reasons) r
                                       WHERE r.value IN (__HARD__))
                  THEN 'active' ELSE e.status END,
    updated_at = now()
WHERE e.id = %(id)s AND e.category_id IS DISTINCT FROM %(category_id)s::uuid
"""


def reclassify_plan(rows, known_slugs) -> dict:
    """Pure: {event id: new slug}.
    - no category → detect_category(title, description);
    - category contradicted by the title ("Blind test" filed as a concert, "Atelier …" as an
      exhibition) → title_category_override.
    Slugs missing from the categories table (migration not applied yet) are skipped."""
    from utils.normalize import detect_category, title_category_override

    plan = {}
    for r in rows:
        current = r.get("slug")
        if current is None:
            new = detect_category(None, r.get("title") or "", r.get("description"))
        else:
            new = title_category_override(r.get("title"), current)
        if new and new != current and new in known_slugs:
            plan[str(r["id"])] = new
    return plan


def reclassify_categories(conn) -> int:
    from pipelines.ingest import _exec_many

    with conn.cursor() as cur:
        cur.execute("SELECT slug, id FROM categories")
        ids = {slug: str(cid) for slug, cid in cur.fetchall()}
        cur.execute(CATEGORY_ROWS_SQL)
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        plan = reclassify_plan(rows, set(ids))
        sql = SET_CATEGORY_SQL.replace("__HARD__", _hard_list())
        params = [{"id": eid, "category_id": ids[slug]} for eid, slug in plan.items()]
        for i in range(0, len(params), WRITE_CHUNK):
            _exec_many(cur, sql, params[i:i + WRITE_CHUNK])
    conn.commit()
    print(f"[categories] {len(rows)} live rows scanned, {len(plan)} (re)classified")
    return len(plan)
