# Migrations SQL (refonte octobre 2026)

Ces fichiers sont à appliquer **dans l’ordre**, sur la base Supabase de production, **avant** de déployer la branche `refonte/p0-p3`. Chaque fichier peut être rejoué : ils sont idempotents.

Ils ont été rejoués sur une copie locale du schéma de production (PGlite, Postgres 17) avec un échantillon réel de données. Les trois passent, et 0005 rejoué une seconde fois ne change plus rien.

| Fichier | Quoi | Risque |
|---|---|---|
| `0003_security_rls.sql` | Active le RLS sur toutes les tables et retire tous les droits des rôles `anon` et `authenticated`. Le site lit et écrit uniquement côté serveur avec le rôle `postgres`, propriétaire des tables et BYPASSRLS (vérifié). Supabase côté navigateur ne sert qu’à l’authentification. | Faible |
| `0004_data_quality_schema.sql` | Nouvelles colonnes : `price_status`, `time_known`, `quality_reasons`, `last_seen_at`, `canonical_event_id`, et côté lieux `normalized_name`, `geocode_*`, `canonical_venue_id`. Ajoute aussi : contraintes CHECK, arrondissements calculés depuis le code postal, coordonnées « centre de Paris » remises à zéro, table `newsletter_subscribers` (qui manquait), préférences en `text[]`, index (5 créés, 6 doublons supprimés), `statement_timeout` de 15 s sur le rôle `postgres`. | Moyen : la table `events` est verrouillée quelques secondes pendant les ALTER et les index |
| `0005_data_cleanup.sql` | Corrige les heures de paris_opendata (le flux annonçait `+00:00` pour des heures de Paris). Puis expire les événements passés, rejette les articles Le Bonbon, les événements hors Île-de-France et les salons professionnels, corrige les faux « gratuit » d’InfoConcert, et met en brouillon les prix et durées aberrants. Aucun DELETE : chaque mise à l’écart est tracée dans `quality_reasons`. | Faible |

## Appliquer

Supabase, SQL Editor : coller le contenu de chaque fichier dans l’ordre, puis *Run*. Ou en ligne de commande :

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/sql/0003_security_rls.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/sql/0004_data_quality_schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/sql/0005_data_cleanup.sql
```

## Juste après

1. **Lancer le pipeline une fois à la main**, pour ré-ingérer avec le nouveau contrat de données et reconstruire Meilisearch :
   ```bash
   cd scrapers && python cron.py --all && python cron.py --post
   ```
   Ou depuis GitHub : Actions → Daily Scraper → *Run workflow*.
2. **Contrôler** : *Advisors* de Supabase (sécurité et performance), puis `select status, count(*) from events group by 1;`.
3. **Retour arrière** : 0003 se défait en remettant les GRANT. 0005 se défait avec `update events set status='active' where quality_reasons ? '<raison>'`. 0004 ajoute seulement des colonnes, des contraintes et des index.
