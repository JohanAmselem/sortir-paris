-- 0013 · Images en grand format (lot D « Données », 23/11/2026)
--
-- Offi et Theatreonline publient des vignettes ; la collecte prend désormais la grande
-- variante (scrapers/utils/images.py, hd_image_url). Ce fichier réécrit les URL déjà en
-- base avec exactement la même règle :
--   * Offi : https://files.offi.fr/<type>/<id>/images/120/<hash>.<ext> (ou /200/)
--            → /images/1000/ (seule taille servie, vérifiée le 23/11/2026 sur les types
--            programmation, evenement, lieu, festival ; 300…1500 et « original » renvoient
--            une redirection 302 vers une page HTML) ;
--   * Theatreonline : …/BDDPhoto/Medias//spectacle|programmation/<id>/xs_1_affiche.<ext>
--            → même chemin sans « xs_ » (affiche complète ; s_, m_, l_ renvoient 404).
--
-- Mesuré le 23/11/2026 (lecture seule) : 8 110 lignes (4 548 URL Offi, 3 562 Theatreonline),
-- dont 5 548 sorties vivantes et 1 843 affichées (canonical_event_id nul). Toutes sources
-- confondues : 754 fiches Ticketmaster (et quelques autres) ont reçu ces vignettes par le
-- dédoublonnage (FILL_SQL). Sur 400 lignes tirées au hasard, la réécriture SQL donne
-- exactement l'URL de hd_image_url (Python).
--
-- Réversible : chaque URL d'origine est d'abord copiée dans events_image_backup_0013 ;
-- 0013_images_hd_RETOUR_ARRIERE.sql la remet. Rejouable : une URL déjà réécrite ne
-- correspond plus au motif, et la sauvegarde garde toujours la toute première valeur.
-- Aucune autre colonne n'est modifiée (updated_at mis à jour pour la synchronisation
-- Meilisearch, à relancer ensuite : cd scrapers && python cron.py --post).

BEGIN;
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS events_image_backup_0013 (
    id uuid PRIMARY KEY,
    image_url text NOT NULL,
    saved_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO events_image_backup_0013 (id, image_url)
SELECT e.id, e.image_url
FROM events e
WHERE e.image_url ~* '^https?://files\.offi\.fr/[a-z_]+/[0-9]+/images/(120|200)/[^/?#]+$'
   OR e.image_url ~* '^https?://(www\.)?theatreonline\.com/BDDPhoto/Medias/+(spectacle|programmation)/[0-9]+/xs_[0-9]+_affiche\.(jpe?g|png|gif|webp)$'
ON CONFLICT (id) DO NOTHING;

-- Offi : /images/120/ ou /images/200/ → /images/1000/
UPDATE events e
SET image_url = regexp_replace(e.image_url, '/images/(120|200)/([^/?#]+)$', '/images/1000/\2', 'i'),
    updated_at = now()
FROM events_image_backup_0013 b
WHERE b.id = e.id
  AND e.image_url ~* '^https?://files\.offi\.fr/[a-z_]+/[0-9]+/images/(120|200)/[^/?#]+$';

-- Theatreonline : …/xs_1_affiche.jpg → …/1_affiche.jpg
UPDATE events e
SET image_url = regexp_replace(e.image_url, '/xs_([0-9]+_affiche\.[a-z]+)$', '/\1', 'i'),
    updated_at = now()
FROM events_image_backup_0013 b
WHERE b.id = e.id
  AND e.image_url ~* '^https?://(www\.)?theatreonline\.com/BDDPhoto/Medias/+(spectacle|programmation)/[0-9]+/xs_[0-9]+_affiche\.(jpe?g|png|gif|webp)$';

COMMIT;

-- Contrôle (doit renvoyer 0 et 0) :
--   select count(*) filter (where image_url ~* 'files\.offi\.fr/.*/images/(120|200)/') offi_petites,
--          count(*) filter (where image_url ~* 'theatreonline\.com/.*/xs_[0-9]+_affiche') to_petites
--   from events;
--   select count(*) from events_image_backup_0013;
