-- Retour arrière de 0012_appli_mobile.sql.
-- À jouer seulement APRÈS avoir redéployé un code qui n'utilise plus ces colonnes.
-- Supprime les jetons de l'appli (les applis installées se réinscriront si 0012 est rejouée).

BEGIN;

DELETE FROM push_subscriptions WHERE kind = 'expo';

ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_web_keys_check;
ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_platform_check;
ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_kind_check;
ALTER TABLE push_subscriptions ALTER COLUMN p256dh SET NOT NULL;
ALTER TABLE push_subscriptions ALTER COLUMN auth SET NOT NULL;
ALTER TABLE push_subscriptions DROP COLUMN IF EXISTS last_seen_at;
ALTER TABLE push_subscriptions DROP COLUMN IF EXISTS platform;
ALTER TABLE push_subscriptions DROP COLUMN IF EXISTS kind;

ALTER TABLE alert_settings DROP COLUMN IF EXISTS drop_notified_week;
ALTER TABLE alert_settings DROP COLUMN IF EXISTS notify_drop;

COMMIT;
