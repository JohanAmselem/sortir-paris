-- 0011 — Publication automatique Instagram : journal des publications, exclusions,
-- accès au compte (jeton longue durée renouvelé automatiquement). Idempotent.

-- 1. Journal : une ligne par publication prévue (carrousel ou story), jamais deux fois
--    le même (type, thème, jour). Préparée la veille (aperçu), publiée à l'heure prévue.
CREATE TABLE IF NOT EXISTS instagram_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('carousel', 'story')),
  theme text NOT NULL CHECK (char_length(theme) BETWEEN 2 AND 40),
  for_date date NOT NULL,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'blocked', 'publishing', 'published', 'failed', 'skipped')),
  caption text NULL CHECK (caption IS NULL OR char_length(caption) <= 2200),
  -- [{ event_id, image_url, credit }] dans l'ordre des images
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  media_id text NULL,
  permalink text NULL,
  error text NULL,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NULL,
  UNIQUE (kind, theme, for_date)
);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_due ON instagram_posts (status, scheduled_at);

-- 2. Exclusions : un lieu, une source ou un événement qui ne doit plus apparaître
--    (demande de retrait des droits sur une photo, par exemple).
CREATE TABLE IF NOT EXISTS instagram_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('venue', 'source', 'event')),
  value text NOT NULL CHECK (char_length(value) BETWEEN 1 AND 200),
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);

-- 3. Accès au compte Instagram (une seule ligne). Le jeton longue durée (60 jours)
--    est renouvelé automatiquement avant expiration.
CREATE TABLE IF NOT EXISTS instagram_credentials (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ig_user_id text NOT NULL,
  username text NULL,
  access_token text NOT NULL,
  expires_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Serveur uniquement (rôle postgres), comme les autres tables (0003).
ALTER TABLE instagram_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON instagram_posts, instagram_exclusions, instagram_credentials FROM anon, authenticated;
