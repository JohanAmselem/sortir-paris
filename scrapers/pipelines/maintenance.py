"""
End-of-run maintenance steps (run once after all sources, before the Meilisearch sync).
"""

from __future__ import annotations

EXPIRE_SQL = """
UPDATE events
SET status = 'expired', updated_at = now()
WHERE status IN ('active', 'draft')
  AND coalesce(end_date, start_date + interval '3 hours') < now() - interval '6 hours'
"""

# Draft events penalised only because their venue had no coordinates yet: once geocoding
# succeeded, give the 15 points back and publish when the score reaches the threshold.
PROMOTE_SQL = """
UPDATE events e
SET quality_score = LEAST(100, e.quality_score + 15),
    quality_reasons = e.quality_reasons - 'venue_not_geocoded',
    status = CASE WHEN e.status = 'draft' AND e.quality_score + 15 >= 50
                       AND NOT EXISTS (
                         SELECT 1 FROM jsonb_array_elements_text(e.quality_reasons) r
                         WHERE r.value IN ('no_title','junk_title','no_start_date','ended','too_far_ahead',
                                           'end_before_start','span_too_long','price_outlier',
                                           'price_inconsistent','free_with_price','out_of_zone',
                                           'online','cancelled')
                       )
                  THEN 'active' ELSE e.status END,
    updated_at = now()
FROM venues v
WHERE v.id = e.venue_id
  AND v.lat IS NOT NULL
  AND e.quality_reasons ? 'venue_not_geocoded'
  AND e.status IN ('draft', 'active')
"""


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
