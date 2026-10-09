-- 0008 — Nettoyage des données existantes (lot 1 « Données »).
-- Prérequis : 0004 (quality_reasons, canonical_venue_id…). 0007 conseillé avant.
--
-- Principes :
--   * aucun DELETE ; une mise à l'écart = un changement de status + sa raison dans
--     quality_reasons (retour arrière : voir en bas) ;
--   * les événements avec activité membre (user_saves, user_attendances, event_reviews)
--     ne changent jamais de status ;
--   * idempotent : rejouer le fichier ne change plus rien ;
--   * par lots : chaque UPDATE touche au plus 5 000 lignes (LIMIT dans la sous-requête).
--     Si un compteur affiche 5000, rejouer le fichier jusqu'à ce qu'il affiche moins.
--
-- Ce qui n'est PAS ici (fait par le pipeline, cron.py --post, à lancer après) :
--   liaison des lieux (link_venues), séances des séries masquées (series_collapsed),
--   reclassement des catégories, géocodage par nom. Les titres (ANNULÉ, COMPLET, dates,
--   majuscules) sont corrigés à la prochaine ingestion de chaque source.

SET statement_timeout = '120s';

-- 1. Codes postaux des lieux : 5 chiffres ou NULL.
--    '75 018' → 75018, '75018.' / '75002 Paris' → 5 chiffres, '750009' → 75009,
--    'à venir' / '7500' / '' → NULL. (Aucune perte : la valeur n'était pas un code postal.)
UPDATE venues v
SET zip_code = CASE
        WHEN regexp_replace(v.zip_code, '(\d{2})\s(\d{3})', '\1\2', 'g') ~ '(^|\D)\d{5}(\D|$)'
            THEN substring(regexp_replace(v.zip_code, '(\d{2})\s(\d{3})', '\1\2', 'g') from '(?:^|\D)(\d{5})(?:\D|$)')
        WHEN v.zip_code ~ '^750(0\d{2}|1[01]\d)$'
            THEN '75' || substring(v.zip_code from 4)
        ELSE NULL END
WHERE v.id IN (
    SELECT id FROM venues
    WHERE zip_code IS NOT NULL AND zip_code !~ '^\d{5}$'
    LIMIT 5000
);

UPDATE venues
SET arrondissement = CASE
        WHEN substring(zip_code from 4 for 2)::int = 1 THEN '1er'
        ELSE (substring(zip_code from 4 for 2)::int)::text || 'e' END
WHERE arrondissement IS NULL AND zip_code ~ '^75(0(0[1-9]|1[0-9]|20)|116)$';

-- 2. Lieux fictifs (« Adresse communiquée à l'inscription », « Lieu secret », « à venir »)
--    → événements rejetés (raison placeholder_venue).
UPDATE events e
SET status = 'rejected',
    quality_reasons = e.quality_reasons || '["placeholder_venue"]'::jsonb,
    updated_at = now()
WHERE e.id IN (
    SELECT e2.id
    FROM events e2
    JOIN venues v ON v.id = e2.venue_id
    CROSS JOIN LATERAL (
        SELECT translate(lower(v.name), 'àâäáéèêëîïíôöóùûüúç', 'aaaaeeeeiiiooouuuuc') AS n
    ) x
    WHERE e2.status IN ('active', 'draft')
      AND NOT e2.quality_reasons ? 'placeholder_venue'
      AND (
        x.n ~ '^\s*(a venir|a definir|a confirmer|tba|tbc|tbd|lieu secret|secret location|adresse secrete)\s*$'
        OR x.n ~ '(adresse|lieu)\s+(communiquee?s?|transmise?s?|envoyee?s?|precisee?s?|donnee?s?)\s+(a|apres|lors|aux|par|sur)\M'
        OR x.n ~ '(communiquee?s?|transmise?s?|envoyee?s?|precisee?s?)\s+(a|apres|lors de)\s+l.?\s*inscription'
        OR lower(coalesce(v.address, '')) ~ '^\s*(a venir|à venir|a definir|à définir|tba|tbc)\s*$'
      )
      AND NOT EXISTS (SELECT 1 FROM user_saves s WHERE s.event_id = e2.id)
      AND NOT EXISTS (SELECT 1 FROM user_attendances a WHERE a.event_id = e2.id)
      AND NOT EXISTS (SELECT 1 FROM event_reviews r WHERE r.event_id = e2.id)
    LIMIT 5000
);

-- 3. Hors zone (Paris + 92/93/94) : code postal d'un autre département, coordonnées hors
--    zone sans code postal dans la zone, ou « …, Marseille » / ville lointaine connue.
UPDATE events e
SET status = 'rejected',
    quality_reasons = e.quality_reasons || '["out_of_zone"]'::jsonb,
    updated_at = now()
WHERE e.id IN (
    SELECT e2.id
    FROM events e2
    JOIN venues v ON v.id = e2.venue_id
    WHERE e2.status IN ('active', 'draft')
      AND NOT e2.quality_reasons ? 'out_of_zone'
      AND (
        (v.zip_code ~ '^\d{5}$' AND left(v.zip_code, 2) NOT IN ('75', '92', '93', '94'))
        OR (v.lat IS NOT NULL
            AND NOT (v.lat BETWEEN 48.70 AND 49.01 AND v.lng BETWEEN 2.14 AND 2.64)
            AND NOT coalesce(left(v.zip_code, 2) IN ('75', '92', '93', '94'), false))
        OR v.name ~* ',\s*(marseille|lyon|lille|bordeaux|toulouse|nantes|nice|strasbourg|montpellier|rennes|reims|rouen|grenoble|dijon|angers|avignon|tours|orl[eé]ans|amiens|metz|nancy|caen|brest|limoges|bruxelles|gen[eè]ve|lausanne|montr[eé]al|londres|london|berlin|amsterdam)\s*$'
        OR v.city ~* '^\s*(marseille|lyon|lille|bordeaux|toulouse|nantes|nice|strasbourg|montpellier|rennes|reims|rouen|grenoble|dijon|angers|avignon|tours|orl[eé]ans|amiens|metz|nancy|caen|brest|limoges|bruxelles|ixelles|gen[eè]ve|lausanne|montr[eé]al|ljubljana|londres|london|berlin|amsterdam)\s*$'
      )
      AND NOT EXISTS (SELECT 1 FROM user_saves s WHERE s.event_id = e2.id)
      AND NOT EXISTS (SELECT 1 FROM user_attendances a WHERE a.event_id = e2.id)
      AND NOT EXISTS (SELECT 1 FROM event_reviews r WHERE r.event_id = e2.id)
    LIMIT 5000
);

-- 4. Titre qui annonce une annulation / un report (« ANNULÉ - … », « … (reporté) »)
--    → status cancelled (raison title_cancelled). Un titre comme « Le mariage annulé »
--    (sans séparateur ni parenthèses) n'est pas touché.
UPDATE events e
SET status = 'cancelled',
    quality_reasons = e.quality_reasons || '["title_cancelled"]'::jsonb,
    updated_at = now()
WHERE e.id IN (
    SELECT e2.id FROM events e2
    WHERE e2.status IN ('active', 'draft')
      AND NOT e2.quality_reasons ? 'title_cancelled'
      AND (
        e2.title ~* '^\s*(annul[ée]e?s?|report[ée]e?s?|cancell?ed|postponed)\s*!?\s*[-–—:|•·/]'
        OR e2.title ~* '^\s*(annul[ée]e?s?|cancell?ed|postponed)\s+\S'
        OR e2.title ~* '[-–—:|•·/,]\s*(annul[ée]e?s?|report[ée]e?s?|cancell?ed|postponed)\s*!?\s*$'
        OR e2.title ~* '[(\[]\s*(annul[ée]e?s?|report[ée]e?s?|cancell?ed|postponed)\s*!?\s*[)\]]'
        OR e2.title ~* '\s(annul|report)[ée]e?s?\s*:'
        OR e2.title ~* '\m(concerts?|spectacles?|shows?|dates?|repr[ée]sentations?|[ée]v[ée]nements?|soir[ée]es?|matchs?)\s+((est|sont)\s+)?(annul|report)[ée]e?s?\M'
      )
      AND NOT EXISTS (SELECT 1 FROM user_saves s WHERE s.event_id = e2.id)
      AND NOT EXISTS (SELECT 1 FROM user_attendances a WHERE a.event_id = e2.id)
      AND NOT EXISTS (SELECT 1 FROM event_reviews r WHERE r.event_id = e2.id)
    LIMIT 5000
);

-- 5. Prix aberrants restés en base (année lue comme un prix : 12 € – 2 026 €).
--    La source ne donne plus de prix (quality_reasons contient price_unknown) mais
--    l'ancienne valeur était conservée → prix inconnu. Seuil : 1 000 € (100 000 centimes).
UPDATE events e
SET price_status = 'unknown', price_min = 0, price_max = 0, is_free = false,
    quality_reasons = e.quality_reasons || '["price_reset"]'::jsonb,
    updated_at = now()
WHERE e.id IN (
    SELECT id FROM events
    WHERE price_max > 100000
      AND price_status <> 'unknown'
      AND status IN ('active', 'draft')
    LIMIT 5000
);

-- 6. Heure 00:00 ou 23:59 (heure de Paris) au début = « heure non donnée » par la source.
UPDATE events e
SET time_known = false,
    quality_reasons = CASE WHEN e.quality_reasons ? 'time_unknown' THEN e.quality_reasons
                           ELSE e.quality_reasons || '["time_unknown"]'::jsonb END,
    updated_at = now()
WHERE e.id IN (
    SELECT id FROM events
    WHERE time_known
      AND status IN ('active', 'draft')
      AND to_char(start_date AT TIME ZONE 'Europe/Paris', 'HH24:MI:SS') IN ('00:00:00', '23:59:00')
    LIMIT 5000
);

RESET statement_timeout;

-- Contrôle :
--   SELECT status, count(*) FROM events GROUP BY 1;
--   SELECT r, count(*) FROM events, jsonb_array_elements_text(quality_reasons) r
--   WHERE r IN ('placeholder_venue','out_of_zone','title_cancelled','price_reset') GROUP BY 1;
--
-- Retour arrière (status seulement ; la prochaine ingestion recalcule de toute façon) :
--   UPDATE events SET status = 'active', quality_reasons = quality_reasons - 'placeholder_venue'
--   WHERE quality_reasons ? 'placeholder_venue' AND status = 'rejected';
--   (idem avec 'out_of_zone' / 'title_cancelled' (status 'cancelled') / 'series_collapsed')
--   Liaison des lieux : UPDATE venues SET canonical_venue_id = NULL;  (si besoin)
