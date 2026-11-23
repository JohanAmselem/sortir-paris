-- Retour arrière de 0013_images_hd.sql : remet les URL d'image d'origine (vignettes)
-- sauvegardées dans events_image_backup_0013, puis supprime cette table.
--
-- À jouer seulement si les grandes images posent problème. Pour que la collecte ne les
-- réécrive pas au passage suivant, redéployer aussi des scrapers sans hd_image_url
-- (scrapers/utils/images.py, appelé par utils/event.make_event et validation.EventIn).
-- Seules les lignes dont l'URL est toujours celle écrite par 0013 sont restaurées : une
-- image changée depuis par la collecte n'est pas écrasée.

BEGIN;
SET LOCAL statement_timeout = '120s';

UPDATE events e
SET image_url = b.image_url,
    updated_at = now()
FROM events_image_backup_0013 b
WHERE b.id = e.id
  AND e.image_url IS DISTINCT FROM b.image_url
  AND e.image_url IN (
      regexp_replace(b.image_url, '/images/(120|200)/([^/?#]+)$', '/images/1000/\2', 'i'),
      regexp_replace(b.image_url, '/xs_([0-9]+_affiche\.[a-z]+)$', '/\1', 'i')
  );

DROP TABLE events_image_backup_0013;

COMMIT;

-- Contrôle : select count(*) from events where image_url ~* 'files\.offi\.fr/.*/images/1000/';
