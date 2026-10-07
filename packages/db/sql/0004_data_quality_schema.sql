-- 0004 — Qualité des données : colonnes de contrat, contraintes, index.
-- Idempotent. À appliquer AVANT de déployer le code de la branche refonte/p0-p3.

-- ── events ────────────────────────────────────────────────────────────────
ALTER TABLE events ADD COLUMN IF NOT EXISTS price_status text NOT NULL DEFAULT 'unknown';
ALTER TABLE events ADD COLUMN IF NOT EXISTS time_known boolean NOT NULL DEFAULT true;
ALTER TABLE events ADD COLUMN IF NOT EXISTS quality_reasons jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE events ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS canonical_event_id uuid REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS attendance_count integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE events ADD CONSTRAINT events_price_status_check
    CHECK (price_status IN ('free', 'paid', 'unknown'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE events ADD CONSTRAINT events_status_check
    CHECK (status IN ('draft', 'active', 'expired', 'rejected', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill price_status depuis les colonnes existantes.
UPDATE events SET price_status = CASE
  WHEN is_free THEN 'free'
  WHEN price_max > 0 OR price_min > 0 THEN 'paid'
  ELSE 'unknown' END
WHERE price_status = 'unknown';

-- min > max : on inverse.
UPDATE events SET price_min = price_max, price_max = price_min WHERE price_min > price_max;

-- Fin avant début : spectacle de nuit (fin le lendemain) sinon fin inconnue.
UPDATE events SET end_date = end_date + interval '1 day'
WHERE end_date < start_date AND start_date - end_date < interval '1 day';
UPDATE events SET end_date = NULL WHERE end_date < start_date;

DO $$ BEGIN
  ALTER TABLE events ADD CONSTRAINT events_price_order_check CHECK (price_min <= price_max);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE events ADD CONSTRAINT events_price_positive_check CHECK (price_min >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE events ADD CONSTRAINT events_dates_order_check CHECK (end_date IS NULL OR end_date >= start_date);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Horaires inconnus : sources à date seule stockées à minuit (UTC ou Paris).
UPDATE events SET time_known = false
WHERE time_known
  AND (
    (start_date AT TIME ZONE 'UTC')::time = '00:00'
    OR (start_date AT TIME ZONE 'Europe/Paris')::time = '00:00'
  );

-- ── venues ────────────────────────────────────────────────────────────────
ALTER TABLE venues ADD COLUMN IF NOT EXISTS normalized_name text;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS geocode_status text NOT NULL DEFAULT 'pending';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS geocode_attempts smallint NOT NULL DEFAULT 0;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS canonical_venue_id uuid REFERENCES venues(id) ON DELETE SET NULL;

-- Arrondissement dérivé du code postal (75001 → "1er", 75011 → "11e", 75116 → "16e").
UPDATE venues SET arrondissement = CASE
    WHEN substring(zip_code from 4 for 2)::int = 1 THEN '1er'
    ELSE (substring(zip_code from 4 for 2)::int)::text || 'e' END
WHERE zip_code ~ '^75(0[0-9]{2}|116)$'
  AND substring(zip_code from 4 for 2)::int BETWEEN 1 AND 20
  AND arrondissement IS NULL;

-- Coordonnées de repli au centroïde de Paris : fausses, à re-géocoder.
UPDATE venues SET lat = NULL, lng = NULL, geocode_status = 'pending'
WHERE round(lat::numeric, 3) = 48.857 AND round(lng::numeric, 3) = 2.352;

UPDATE venues SET geocode_status = 'ok' WHERE lat IS NOT NULL AND lng IS NOT NULL AND geocode_status = 'pending';

-- ── newsletter (table utilisée par /api/newsletter mais jamais créée) ─────
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  confirmed boolean NOT NULL DEFAULT false,
  confirm_token text,
  unsubscribed boolean NOT NULL DEFAULT false,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON newsletter_subscribers FROM anon, authenticated;

-- ── préférences : slugs (text[]) au lieu d'uuid[] (onboarding cassé) ───────
ALTER TABLE user_preferences ALTER COLUMN categories DROP DEFAULT;
ALTER TABLE user_preferences ALTER COLUMN categories TYPE text[] USING categories::text[];
ALTER TABLE user_preferences ALTER COLUMN categories SET DEFAULT '{}';
ALTER TABLE user_preferences ALTER COLUMN ambiances DROP DEFAULT;
ALTER TABLE user_preferences ALTER COLUMN ambiances TYPE text[] USING ambiances::text[];
ALTER TABLE user_preferences ALTER COLUMN ambiances SET DEFAULT '{}';

-- ── index ─────────────────────────────────────────────────────────────────
-- Doublons exacts (signalés par l'advisor).
DROP INDEX IF EXISTS idx_events_category;
DROP INDEX IF EXISTS idx_events_start_date;
DROP INDEX IF EXISTS idx_events_venue;
DROP INDEX IF EXISTS idx_events_slug;
DROP INDEX IF EXISTS idx_events_source_sourceid;
DROP INDEX IF EXISTS idx_venues_slug;

CREATE INDEX IF NOT EXISTS idx_events_live_end ON events (coalesce(end_date, start_date)) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_events_live_start ON events (start_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_events_live_cat_quality ON events (category_id, quality_score DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_events_live_free ON events (start_date) WHERE status = 'active' AND price_status = 'free';
CREATE INDEX IF NOT EXISTS idx_events_popularity ON events ((save_count * 3 + view_count) DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_events_canonical ON events (canonical_event_id) WHERE canonical_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_title_trgm ON events USING gin (lower(title) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_event_tags_tag ON event_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_user_saves_event ON user_saves (event_id);
CREATE INDEX IF NOT EXISTS idx_user_swipes_event ON user_swipes (event_id);
CREATE INDEX IF NOT EXISTS idx_user_views_event ON user_views (event_id);
CREATE INDEX IF NOT EXISTS idx_venues_geo ON venues (lat, lng) WHERE lat IS NOT NULL;

-- ── garde-fous ────────────────────────────────────────────────────────────
-- Une requête ne doit jamais bloquer une page : coupure côté serveur à 15 s.
-- (Supavisor ignore les paramètres de connexion, d'où le réglage par rôle.)
ALTER ROLE postgres SET statement_timeout = '15s';
ALTER ROLE postgres SET idle_in_transaction_session_timeout = '30s';
