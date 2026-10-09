-- 0006 — Search without a full table scan (audit 9 Oct 2026).
-- The web search used translate(lower(title || short_desc || keywords || venue)) LIKE '%…%'
-- with no usable index (~1 s per query, timeouts under load). This trigram index covers
-- the event text; the venue name is matched separately (small table).
-- The expression must stay identical to eventSearchText in apps/web/src/lib/events/query.ts.
-- CONCURRENTLY: no table lock (run outside a transaction).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_search_trgm ON events
  USING gin ((translate(lower(title || ' ' || coalesce(short_desc, '') || ' ' || coalesce(keywords, '')),
                        'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy')) gin_trgm_ops)
  WHERE status = 'active' AND canonical_event_id IS NULL;

-- Unused (0 scans, 18 MB): superseded by idx_events_search_trgm.
DROP INDEX CONCURRENTLY IF EXISTS idx_events_title_trgm;

-- Duplicates of other indexes (same columns) — every write paid for them twice.
DROP INDEX CONCURRENTLY IF EXISTS idx_events_slug;          -- = events_slug_unique
DROP INDEX CONCURRENTLY IF EXISTS idx_events_venue;         -- = idx_events_venue_id
DROP INDEX CONCURRENTLY IF EXISTS idx_events_category;      -- = idx_events_category_id
DROP INDEX CONCURRENTLY IF EXISTS idx_venues_slug;          -- = venues_slug_unique

-- Venue matching in the scrapers and search look venues up by normalized name.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_venues_normalized_name ON venues (normalized_name);
