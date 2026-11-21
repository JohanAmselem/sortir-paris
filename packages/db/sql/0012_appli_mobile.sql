-- 0012 · Appli mobile (21/11/2026)
--
-- 1. push_subscriptions accueille aussi les jetons de l'appli (Expo Push) :
--    colonne `kind` ('web' par défaut, 'expo' pour l'appli), plateforme,
--    dernière activité. Les clés p256dh / auth ne valent que pour le Web Push :
--    elles deviennent facultatives, mais restent obligatoires pour kind = 'web'.
-- 2. alert_settings : `notify_drop` (notification du Drop du lundi, activée par
--    défaut) et `drop_notified_week` (semaine déjà notifiée : jamais deux fois).
--
-- Additive et rejouable : aucune donnée existante n'est modifiée ni supprimée.
-- À appliquer AVANT de déployer le code de la branche feat/appli-mobile.
-- Retour arrière : 0012_appli_mobile_RETOUR_ARRIERE.sql

BEGIN;

ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'web';
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS platform text NULL;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NULL;
ALTER TABLE push_subscriptions ALTER COLUMN p256dh DROP NOT NULL;
ALTER TABLE push_subscriptions ALTER COLUMN auth DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_kind_check CHECK (kind IN ('web', 'expo'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_platform_check CHECK (platform IS NULL OR platform IN ('ios', 'android'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_web_keys_check CHECK (kind <> 'web' OR (p256dh IS NOT NULL AND auth IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE alert_settings ADD COLUMN IF NOT EXISTS notify_drop boolean NOT NULL DEFAULT true;
ALTER TABLE alert_settings ADD COLUMN IF NOT EXISTS drop_notified_week date NULL;

COMMIT;

-- Contrôle :
--   select kind, count(*) from push_subscriptions group by 1;
--   select notify_drop, count(*) from alert_settings group by 1;
