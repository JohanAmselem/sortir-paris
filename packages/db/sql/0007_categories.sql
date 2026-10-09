-- 0007 — Deux nouvelles catégories : soirées & clubs, sport & bien-être.
-- Idempotent (ON CONFLICT DO NOTHING : slug et nom sont uniques). Prérequis : aucun.
--
-- Les scrapers (scrapers/utils/normalize.py, VALID_CATEGORIES) produisent déjà les slugs
-- 'soirees' et 'sport' ; tant que ce fichier n'est pas appliqué, ces événements restent
-- sans catégorie (le pipeline cherche l'id par slug et n'écrit rien s'il n'existe pas).
-- Après application, l'étape post « categories » (cron.py --post) reclasse les
-- événements en ligne sans catégorie.
--
-- Retour arrière : DELETE FROM categories WHERE slug IN ('soirees', 'sport')
-- (après avoir remis category_id à NULL sur les événements concernés).

INSERT INTO categories (name, slug, icon, color, position) VALUES
    ('Soirées & clubs', 'soirees', '🪩', '#BE185D', 11),
    ('Sport & bien-être', 'sport', '🏃', '#0891B2', 12)
ON CONFLICT DO NOTHING;  -- slug or name already there: nothing to do
