-- 0010 — Alertes artistes : qui joue dans chaque événement, ouverture de billetterie,
-- préférences d'alerte, abonnements push, journal des envois.
-- Idempotent. Prérequis : 0009 (user_follows, kind = 'artist').
--
-- Clé d'artiste (artist_key) : nom en minuscules, accents retirés, tout caractère
-- non alphanumérique remplacé par un espace, espaces fusionnés, bornes retirées.
-- Même règle en Python (scrapers/utils/artists.py) et en TypeScript (apps/web/src/lib/artists.ts).
-- Un suivi d'artiste = user_follows(kind 'artist', term = artist_key).

-- 1. Artistes d'un événement (Ticketmaster : attractions ; autres sources : titre analysé).
CREATE TABLE IF NOT EXISTS event_artists (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  artist_key text NOT NULL CHECK (char_length(artist_key) BETWEEN 2 AND 80),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  -- 'source' : donné par la source (fiable) ; 'title' : déduit du titre.
  origin text NOT NULL DEFAULT 'title' CHECK (origin IN ('source', 'title')),
  PRIMARY KEY (event_id, artist_key)
);
CREATE INDEX IF NOT EXISTS idx_event_artists_key ON event_artists (artist_key);

-- 2. Ouverture de la billetterie (Ticketmaster sales.public.startDateTime).
ALTER TABLE events ADD COLUMN IF NOT EXISTS on_sale_at timestamptz NULL;

-- 3. Préférences d'alerte (une ligne par membre, créée à la première modification).
CREATE TABLE IF NOT EXISTS alert_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT false,
  notify_new_date boolean NOT NULL DEFAULT true,
  notify_on_sale boolean NOT NULL DEFAULT true,
  notify_reminder boolean NOT NULL DEFAULT true,
  -- Lien de désinscription sans connexion.
  unsubscribe_token text NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Abonnements Web Push (un par navigateur / appareil).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (char_length(endpoint) <= 1000),
  p256dh text NOT NULL CHECK (char_length(p256dh) <= 200),
  auth text NOT NULL CHECK (char_length(auth) <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_error_at timestamptz NULL
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);

-- 5. Journal des alertes : jamais deux fois la même (membre, événement, type).
CREATE TABLE IF NOT EXISTS alert_deliveries (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('new_date', 'on_sale', 'reminder')),
  channels text[] NOT NULL DEFAULT '{}',
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_sent ON alert_deliveries (sent_at);

-- Accès : serveur uniquement (rôle postgres), comme les autres tables membres (0003).
ALTER TABLE event_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON event_artists, alert_settings, push_subscriptions, alert_deliveries FROM anon, authenticated;
