-- 0009 — Suivis (lot 4B) : un membre suit un lieu ou un artiste / une œuvre.
-- Idempotent. Table neuve et vide : aucun verrou sur les tables existantes,
-- sauf l'index sur venues (petite table, quelques millisecondes).
-- Le site lit et écrit côté serveur avec le rôle postgres (BYPASSRLS) : RLS
-- activé, aucun droit pour anon / authenticated, comme dans 0003.

CREATE TABLE IF NOT EXISTS user_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('venue', 'artist')),
  venue_id uuid NULL REFERENCES venues(id) ON DELETE CASCADE,
  -- Texte normalisé (minuscules, accents retirés comme la recherche), 2 à 80 caractères.
  term text NULL CHECK (term IS NULL OR char_length(term) BETWEEN 2 AND 80),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- « Nouveautés pour toi » : événements ajoutés depuis cette date.
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  -- Réservé à un futur envoi d'alertes (e-mail / push) : dernier envoi.
  last_notified_at timestamptz NULL,
  CONSTRAINT user_follows_target_check CHECK (
    (kind = 'venue' AND venue_id IS NOT NULL AND term IS NULL)
    OR (kind = 'artist' AND term IS NOT NULL AND venue_id IS NULL)
  )
);

-- Un seul suivi par (membre, lieu) ou (membre, terme).
CREATE UNIQUE INDEX IF NOT EXISTS user_follows_unique
  ON user_follows (user_id, kind, (coalesce(venue_id::text, term)));
CREATE INDEX IF NOT EXISTS idx_user_follows_user ON user_follows (user_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_venue ON user_follows (venue_id) WHERE venue_id IS NOT NULL;

-- Lieux fusionnés : retrouver les alias d'un lieu canonique sans parcourir la table.
CREATE INDEX IF NOT EXISTS idx_venues_canonical_venue ON venues (canonical_venue_id) WHERE canonical_venue_id IS NOT NULL;

ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON user_follows FROM anon, authenticated;
