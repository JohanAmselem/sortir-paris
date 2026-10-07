-- 0005 — Nettoyage des données publiées (réversible : aucun DELETE).
-- Chaque mise à l'écart ajoute sa raison dans quality_reasons.
-- Prérequis : 0004.

-- 0. Fuseau horaire paris_opendata : le flux annonce « +00:00 » mais les heures
--    sont des heures de Paris (vérifié sur les occurrences de l'API). On réinterprète
--    l'heure murale UTC comme heure de Paris, une seule fois (marqueur tz_fixed),
--    et seulement sur les lignes pas encore ré-ingérées (last_seen_at nul).
UPDATE events
SET start_date = (start_date AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris',
    end_date = CASE WHEN end_date IS NULL THEN NULL ELSE (end_date AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' END,
    quality_reasons = quality_reasons || '["tz_fixed"]'::jsonb,
    updated_at = now()
WHERE source = 'paris_opendata'
  AND last_seen_at IS NULL
  AND NOT quality_reasons ? 'tz_fixed';

-- 1. Expiration : tout ce qui est terminé depuis plus de 6 h.
UPDATE events
SET status = 'expired', updated_at = now()
WHERE status = 'active'
  AND coalesce(end_date, start_date + interval '3 hours') < now() - interval '6 hours';

-- 2. Le Bonbon : articles éditoriaux ingérés comme événements (aucun lieu, aucune description).
UPDATE events
SET status = 'rejected',
    quality_reasons = quality_reasons || '["editorial_not_event"]'::jsonb,
    updated_at = now()
WHERE source = 'lebonbon' AND venue_id IS NULL AND status IN ('active', 'draft', 'expired');

-- 3. Hors zone : lieu géocodé hors Île-de-France.
UPDATE events e
SET status = 'rejected',
    quality_reasons = e.quality_reasons || '["out_of_zone"]'::jsonb,
    updated_at = now()
FROM venues v
WHERE e.venue_id = v.id
  AND e.status IN ('active', 'draft')
  AND v.lat IS NOT NULL
  AND NOT (v.lat BETWEEN 48.12 AND 49.24 AND v.lng BETWEEN 1.44 AND 3.56);

-- 4. Hors sujet : salons pro / business (Eventbrite).
UPDATE events
SET status = 'rejected',
    quality_reasons = quality_reasons || '["off_topic_business"]'::jsonb,
    updated_at = now()
WHERE status IN ('active', 'draft')
  AND source = 'eventbrite'
  AND title ~* '(career fair|job fair|salon de l''emploi|recrutement|networking|venture capital|investor|startup pitch|webinar|formation certifiante|masterclass business)';

-- 5. InfoConcert : "gratuit" faux quand la description annonce un prix.
UPDATE events
SET is_free = false, price_status = 'unknown', price_min = 0, price_max = 0,
    quality_reasons = quality_reasons || '["free_flag_corrected"]'::jsonb,
    updated_at = now()
WHERE source = 'infoconcert' AND is_free
  AND description ~ '[0-9]+([.,][0-9]{1,2})?\s*(€|eur)';

-- 6. Prix aberrants (> 300 €) : cours / abonnements annuels → brouillon.
UPDATE events
SET status = 'draft',
    quality_reasons = quality_reasons || '["price_outlier"]'::jsonb,
    updated_at = now()
WHERE status = 'active' AND price_max > 30000;

-- 7. Durées aberrantes (> 400 jours) : brouillon, sauf lieux permanents connus.
UPDATE events
SET status = 'draft',
    quality_reasons = quality_reasons || '["duration_outlier"]'::jsonb,
    updated_at = now()
WHERE status = 'active' AND end_date - start_date > interval '400 days';

-- Contrôle
SELECT status, count(*) FROM events GROUP BY status ORDER BY 2 DESC;
