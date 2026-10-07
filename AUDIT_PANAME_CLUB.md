# Audit Paname Club — Phase A (audit) + Phase B (plan)

*7 octobre 2026. Audit en lecture seule : aucune modification du code ni de la base.*

**Sources de l'audit :**
- lecture intégrale du repo `JohanAmselem/sortir-paris` (commit `08b12a6`, 8 avril 2026) ;
- requêtes SQL en lecture seule sur Supabase `yshuqohvbwweppujzgtr` ;
- crawl HTTP de 142 URLs du site en ligne ;
- rendu Playwright (iPhone 13, 320 px, desktop 1440 px) en fuseau Europe/Paris ;
- `pnpm install`, typecheck, lint et build locaux.

Sévérités : **CRITIQUE / IMPORTANT / MOYEN / MINEUR**. Risque de correction : faible / moyen / élevé.

---

## 0. Résumé

Le concept est bon. Le socle technique (Next 15, Drizzle, Supabase, Mapbox) est raisonnable et le code reste lisible. Mais la promesse « qu'est-ce que je fais ce soir » est trahie à trois niveaux.

1. **Le site tombe.** La homepage et `/ce-soir` restent bloquées par intermittence sur « Chargement… » pendant plus de 60 s. Mesuré en direct cette nuit : 4 essais ont été nécessaires pour charger la homepage mobile.
   - Le pool de 3 connexions à la base n'a aucun délai limite.
   - Les fonctions Vercel tournent en Virginie (iad1) alors que la base est à Paris.
   - Supabase est en « grace period over » : quota du plan gratuit dépassé.
2. **Les données mentent.**
   - 91,6 % des 42 736 événements en base sont passés mais toujours actifs.
   - Des séances de cinéma sont **inventées** : TMDB et le repli AlloCiné génèrent des séances qui n'existent pas.
   - 1 198 concerts InfoConcert sont marqués « gratuit » alors qu'ils coûtent 35 € ou plus.
   - « Ce soir » affiche des activités de 13 h ; les heures sont décalées (UTC au lieu de Paris).
   - Les expositions en cours n'apparaissent nulle part.
   - 1 255 événements sont épinglés sur Notre-Dame : coordonnées de repli au centre de Paris.
3. **L'IA n'existe pas.** L'identifiant de modèle `claude-haiku-4-20250404` n'existe pas : chaque recherche « IA » échoue en silence et retombe sur des expressions régulières. Le badge « IA » est donc trompeur.

S'y ajoute une faille de sécurité **CRITIQUE**. Le RLS est désactivé sur les 20 tables et la clé anon est publique. Les e-mails des 27 utilisateurs sont lisibles par n'importe qui, et toutes les tables sont modifiables, voire vidables (TRUNCATE).

---

## 1. Architecture actuelle

```
GitHub Actions (cron 06:00 UTC, 120 min max, repo privé → quota 2000 min/mois)
   └─ scrapers/cron.py → 22 spiders Python → normalize.py → ingest.py (psycopg)
        ├─ upsert Postgres (Supabase eu-west-3, plan FREE)
        ├─ géocodage BAN (venues sans coordonnées, 500/run)
        └─ sync Meilisearch (tous les events "active", ~42k docs/jour)
scripts/generate-tags.ts, scripts/sync-meilisearch.ts : manuels, non planifiés

Vercel (Next 15.5.14 App Router, React 19, Tailwind 4) — fonctions en iad1 (USA)
   ├─ Données : Drizzle + postgres.js (pool max 3, sans timeout) → Supavisor
   ├─ Auth : Supabase (@supabase/ssr) — middleware getUser() sur CHAQUE requête
   ├─ Recherche : Meilisearch (clé master côté serveur) + fallback ILIKE
   ├─ "IA" : Anthropic SDK, modèle inexistant → fallback regex
   ├─ Carte : mapbox-gl, markers DOM, clustering maison, 500 events max
   └─ Gamification : Match (swipe), Drop, Quiz, ADN, XP, Top, Avis
```

**Pages :** `/`, `/ce-soir`, `/ce-week-end`, `/gratuit`, `/evenements` (+ `?q`, filtres), `/evenements/[slug]`, `/categories/[slug]`, `/collections` (6 collections codées en dur), `/lieux` et `/lieux/[slug]`, `/paris/[zone]` (20 arrondissements), `/carte`, `/surprise`, `/top`, `/match`, `/drop`, `/quiz`, `/news` et `/news/[slug]`, `/newsletter`, `/compte/*`, `/login`, `/onboarding`, `/partage`.

**API :** 20 routes. 4 ne sont jamais appelées par l'interface : `search/ai`, `categories`, `events/[id]` et `GET news`.

**Base de données :**

| Table | Lignes |
|---|---|
| events | 42 736 |
| venues | 3 672 |
| event_tags | 136 698 |
| tags | 7 845 |
| users | 27 |
| ambiances | 9 |
| event_ambiances | 0 |
| articles | 10 (tous du 6 avril) |

- Taille totale : 128 Mo sur 500 Mo.
- Dérive des migrations : `event_reviews`, `user_swipes`, `weekly_drops`, `taste_*`, `newsletter_subscribers` et `attendance_count` ne figurent dans aucune migration.

**Outillage :**
- **Typecheck :** `turbo typecheck` échoue, faute de `tsconfig` dans `packages/*`. `apps/web` seul passe, mais avec environ 30 casts `as never`.
- **Lint :** aucune configuration ESLint ; `next lint` reste bloqué sur un prompt interactif.
- **Tests et CI :** aucun test, aucune CI web.
- **Build :** dépend de la base (`generateStaticParams` sur les collections).
- **Dépendances inutilisées :** framer-motion, zustand, react-query, instant-meilisearch, cva, date-fns.

**Analytics :** aucun outil installé (ni Plausible, ni Vercel Analytics, ni GA). Seul un compteur `view_count` existe, et il est manipulable.

---

## 2. Constats

### 2.1 Bugs et disponibilité

| # | Sév. | Problème | Où | Cause | Conséquence | Solution | Risque |
|---|---|---|---|---|---|---|---|
| B1 | CRITIQUE | Homepage et `/ce-soir` bloquées plus de 60 s par intermittence (81 requêtes sur 142 pendant le crawl, reproduit dans Chromium) | `packages/db/src/index.ts:47`, `middleware.ts`, pages `force-dynamic` | Pool postgres.js `max:3` sans `statement_timeout` ni délai d'attente ; 7 à 13 requêtes par homepage ; prefetch des 84 cartes ; `getUser()` sur chaque requête ; fonctions en iad1 face à une base à Paris ; quota Supabase dépassé | Le site paraît en panne ; Googlebot reçoit des pages vides | Timeouts, pool adapté, région `cdg1`, ISR/cache sur les listes, `prefetch={false}`, middleware limité à `/compte` | moyen |
| B2 | CRITIQUE | Recherche « IA » et génération d'articles ne fonctionnent pas | `lib/ai-search.ts:277`, `lib/article-generator.ts:238` | Modèle `claude-haiku-4-20250404` inexistant ; erreur avalée | Promesse IA mensongère ; aucun article depuis avril | `claude-haiku-4-5`, timeout de 5 s, fallback visible et journalisé (uniquement **après** l'ajout du rate limiting, voir S3) | faible |
| B3 | CRITIQUE | Fenêtres de temps calculées en UTC | `ce-soir`, `ce-week-end`, `evenements`, `api/events`, `gratuit`, `ai-search`, `event-map`, `swipe`, `drop` | `setHours` / `getDay` sur un runtime UTC ; 5 versions divergentes de « week-end » | « Ce soir » = toute la journée à partir de 02 h (activités de 13 h badgées « CE SOIR ») ; le dimanche, le filtre week-end saute au week-end suivant | Module unique `lib/paris-time.ts` (date-fns-tz) ; « ce soir » = aujourd'hui de 17 h à 04 h, heure de Paris | moyen |
| B4 | CRITIQUE | Les événements en cours (expositions) n'apparaissent nulle part | Tous les `gte(startDate, now)`, `collections-data.ts`, `sitemap.ts`, `carte` | Filtre sur la date de début au lieu de la date de fin | « Les expos du moment » presque vide ; un concert commencé disparaît | Filtre `coalesce(end_date, start_date) >= now`, plus un index | moyen |
| B5 | IMPORTANT | Erreur React #418 (hydratation) sur 5 des 7 pages testées | `lib/utils.ts:24` (`formatEventDate`), `event-card.tsx` | `toLocale*` sans `timeZone` : le serveur affiche l'heure UTC, le client l'heure locale | Heures fausses dans le HTML vu par Google ; re-rendu côté client | `Intl.DateTimeFormat` avec `timeZone: 'Europe/Paris'` partout | faible |
| B6 | IMPORTANT | `/evenements?q=jazz` ignore la requête (moins de 8 caractères) | `evenements/page.tsx:346` | `getEvents()` ne lit pas `q` | La recherche semble cassée | Brancher Meilisearch | faible |
| B7 | IMPORTANT | Défilement infini : cartes 25 à 48 en double ; après des résultats IA, des événements sans rapport | `infinite-event-grid.tsx:41-69` | 48 éléments chargés par le serveur, puis pagination par pas de 24 ; `q` non transmis | Doublons, résultats hors sujet | Offset = `events.length` ; transmettre `q` | faible |
| B8 | IMPORTANT | Préférences d'onboarding jamais enregistrées | `onboarding/page.tsx:82`, `schema/users.ts:21` | Slugs écrits dans des colonnes `uuid[]` ; réponse non vérifiée | « Pour toi » ne s'affiche jamais | Colonnes `text[]` (migration) ou mapping ; vérifier `res.ok` | moyen |
| B9 | IMPORTANT | `/recherche` renvoie 404 | `next.config.ts` | Pas de route ni de redirection | Liens cassés | Redirection vers `/evenements?q=` | faible |
| B10 | IMPORTANT | Fiches événement, catégorie et lieu en cache indéfiniment | `evenements/[slug]`, `categories/[slug]`, `lieux/[slug]` | Ni `revalidate` ni API dynamique | Statut figé jusqu'au prochain déploiement | `revalidate` de 300 à 600 s | faible |
| B11 | MOYEN | Le filtre `arr=2e` renvoie aussi le 12e et le 20e | `api/events/route.ts:34` | `ILIKE '%2e%'` | Mauvais résultats | Correspondance exacte | faible |
| B12 | MOYEN | Les filtres ne font rien sur `/ce-soir`, `/ce-week-end`, `/gratuit` et `/paris/[zone]` | Ces pages | Paramètres ignorés | L'interface paraît cassée | Les appliquer ou masquer ces filtres | faible |
| B13 | MOYEN | « Autour de moi » à moitié appliqué | `getEvents` | lat/lng ignorés côté serveur | Résultats non triés par distance | Tri par distance côté serveur | faible |
| B14 | MOYEN | Identifiants invalides : erreur 500 au lieu de 400 | `/partage`, `/api/attendance`, `views`, `reviews` | UUID non validé | Erreurs 500 | Validation zod | faible |
| B15 | MOYEN | La connexion ignore `?next` | `login/page.tsx` | — | L'utilisateur perd sa page après connexion | Transmettre `next` | faible |
| B16 | MINEUR | Événements d'un lieu triés du plus lointain au plus proche | `lieux/[slug]` | `desc(startDate)` | Ordre absurde | `asc` | faible |

### 2.2 Données (le cœur du problème)

Chiffres mesurés en base le 7 octobre 2026.

**Par source :**

| Source | Lignes | Vivantes | Verdict |
|---|---|---|---|
| allocine | 24 198 (57 %) | 0 | Séances **inventées** à 20 h quand l'horaire réel est introuvable ; une ligne par film × cinéma × jour ; une clé en double renomme Pathé Beaugrenelle en « Le Desperado » |
| paris_opendata (QFAP) | 12 133 | 3 513 | **Source principale et fiable** : 97 % du contenu vivant |
| eventbrite | 2 164 | 60 | Toutes à 00:00 UTC (affichées à 02 h) ; 421 hors de Paris (Rouen, Reims…) ; salons de l'emploi à New York |
| lebonbon | 1 231 | 0 | Ce sont des **articles**, pas des événements : aucune image, aucun lieu, aucune description, URLs malformées |
| infoconcert | 1 222 | 0 | Date fausse sur 513 événements (des concerts d'octobre stockés en juin) ; 1 198 marqués gratuits alors qu'ils coûtent 35 € ou plus ; la même image de Muse sur 444 événements ; plus rien depuis le 19 juin |
| parisjazzclub | 1 119 | 0 | Aucun lieu, description « Concert de jazz. » partout, 22 h codé en dur |
| openagenda | 646 | 24 | Bonne qualité ; à étendre |
| tmdb | — | — | Génère des **séances fictives** à 14 h chaque jour |
| meetup, quefaire, offi, paris_fr, sortiraparis, timeout, billetreduc | 0 | 0 | Échouent à **chaque** passage : valeurs NULL dans des colonnes NOT NULL, 0 insertion, aucune alerte |

**Constats :**

| # | Sév. | Problème | Preuve | Solution | Risque |
|---|---|---|---|---|---|
| D1 | CRITIQUE | Aucun événement n'expire jamais | 39 130 événements passés toujours `active` ; statut `expired` = 0 | Job nocturne d'expiration ; les listes filtrent sur la date de fin ; fiche événement : bandeau « Terminé », noindex et suggestions | faible |
| D2 | CRITIQUE | Le cron s'arrête vers le 19 de chaque mois | Trous dans `ingestion_logs` du 19 au 1er, chaque mois depuis avril (quota GitHub Actions d'un repo privé) | Sortir du quota : runner Railway (le Dockerfile existe), cron Vercel, ou repo public | faible |
| D3 | CRITIQUE | Événements fabriqués (TMDB, repli AlloCiné) | `tmdb_cinema.py:171`, `allocine.py:311` | Désactiver tout de suite | faible |
| D4 | CRITIQUE | Détection « gratuit » cassée | `"0€"` reconnu dans `10€` ; « Free Jazz » considéré gratuit ; prix manquant = gratuit (vérifié) | Expressions régulières ancrées et prix à 3 états : gratuit / payant / inconnu | faible (nécessite un recalcul des données existantes) |
| D5 | CRITIQUE | Échec silencieux de l'ingestion | Un échec annule jusqu'à 24 événements valides (commit tous les 25) ; `errors` toujours `[]` ; `started_at` écrit à la fin | Un SAVEPOINT par événement ; vrais logs ; alerte quand found > 0 et new = 0 | faible |
| D6 | IMPORTANT | Heures locales de Paris stockées comme de l'UTC dans environ 15 spiders | Datetimes naïfs ; 2 164 événements Eventbrite et 1 527 opendata à minuit UTC | Helper `to_utc_paris()` et drapeau `time_known` (« horaire non communiqué ») | moyen |
| D7 | IMPORTANT | Prix incohérents | 29 825 événements à 0 € mais non gratuits (prix inconnu, impossible à distinguer de gratuit) ; 96 avec min > max (affiché « 30 € — 12 € » en homepage) ; 26 au-delà de 300 € (cours annuels) | Prix nullable, contraintes CHECK, inversion automatique, signalement au-delà de 300 € | moyen |
| D8 | IMPORTANT | Dates aberrantes | 204 fins avant le début ; 754 durées de plus de 6 mois ; 349 démarrages avant 2025 | Contraintes CHECK après nettoyage ; drapeau `is_permanent` | faible |
| D9 | IMPORTANT | Géographie fausse | 97 lieux au centroïde de Paris (Grand Rex, Louvre…), soit 1 255 événements sur Notre-Dame ; 148 sans coordonnées ; arrondissement NULL sur **100 %** des lieux ; 41 hors Île-de-France | Re-géocodage BAN (score ≥ 0,6, type housenumber) ; arrondissement déduit du code postal ; filtre géographique Île-de-France | moyen |
| D10 | IMPORTANT | Lieux en double | 458 groupes partagent la même adresse (+679 lignes) ; « 211 av. Jean Jaurès » = 10 lieux | Lieu canonique : nom normalisé, alias, proximité < 100 m ; fusion par migration | moyen |
| D11 | MOYEN | Doublons d'événements entre sources | 7 groupes visibles, sous-estimé faute de lieu sur jazz et lebonbon | Clé de déduplication : titre normalisé + jour Paris + lieu canonique (trigramme) | moyen |
| D12 | MOYEN | Catégories fausses | 2 381 sans catégorie ; concerts classés en expo ; « Duo gourmand : sablés » **en Une** de la homepage, classé « Exposition » ; « Réparer par l'art » classé « Concert » | Mapping explicite par source, mots entiers, catégorie « Autre », table de corrections manuelles | faible |
| D13 | MOYEN | Tags inexploitables | 7 845 tags, dont 5 230 utilisés une seule fois ; « escape game » sur 2 355 événements, presque toujours à tort ; 0 ambiance attribuée | Vocabulaire contrôlé d'environ 150 tags et de 5 à 8 tags par événement ; ambiances calculées par règles | faible |
| D14 | MOYEN | Contenu éditorial périmé | 10 articles du 6 avril (« printemps », « avril ») ; 55 des 56 événements liés sont passés ; collection `expos-printemps` en octobre | Dépublier ; slugs neutres + 301 | nul |
| D15 | MOYEN | Score de qualité inopérant | Titre + image = 40 ≥ 30, donc tout est publié ; 38 473 événements ont un score ≥ 80 | Couche de validation : rejets durs + score + `quality_reasons`, d'abord en mode observation | faible |

**Comment un événement arrive à l'écran, et où la qualité se dégrade** (⚠ = point de dégradation) :

```
source → spider (⚠ dates naïves, ⚠ prix par sous-chaîne, ⚠ catégorie par défaut, ⚠ fabrication)
       → normalize (⚠ html.unescape après strip → XSS, ⚠ mots collés, ⚠ slug titre+date = collisions)
       → find_or_create_venue (⚠ match nom exact, ⚠ renomme le lieu, ⚠ pas d'arrondissement)
       → upsert (⚠ dédup même lieu + même jour UTC, ⚠ ON CONFLICT slug DO NOTHING = pertes, ⚠ rollback de lot)
       → status = active si score≥30 (⚠ aucune validation)
       → Meilisearch (⚠ jamais de suppression, ⚠ sync complète écrase tags/keywords)
       → web (⚠ filtre start>=now, ⚠ UTC, ⚠ aucun contrôle de statut sur la fiche)
```

### 2.3 UX et produit

| # | Sév. | Problème | Conséquence | Solution |
|---|---|---|---|---|
| U1 | CRITIQUE | « Ce soir » ne veut pas dire ce soir : à 2 h du matin, il affiche « Des livres et des biberons, 13:00 » avec le badge CE SOIR | Perte de confiance immédiate sur la promesse centrale | Définition produit : de maintenant à 4 h, à partir de 17 h, heure de Paris ; « En ce moment » pour les activités de jour |
| U2 | IMPORTANT | Homepage : 10 rangées quasi identiques (À la une, Ce soir, Cette semaine, Tendances, Dernière chance, Gratuits…) avec les **mêmes cartes** répétées ; À la une mal catégorisée ; Tendances fondées sur des vues manipulables | Effet catalogue froid ; aucune hiérarchie | Homepage éditoriale (voir la refonte P2) |
| U3 | IMPORTANT | La promesse IA n'est pas tenue : regex derrière le badge ; les chips « J'ai envie de » mènent à une liste générique ; aucun « pourquoi c'est recommandé » | Promesse marketing creuse | « Je veux sortir… » : intention transformée en filtres visibles et modifiables, plus 3 recommandations argumentées |
| U4 | IMPORTANT | Navigation dispersée : 10 liens dans le header ; bottom nav Accueil / Explorer / **Match** / **Top** / Profil, alors que Top est vide et Match a 15 swipes au total | La gamification masque l'usage principal | Bottom nav : Ce soir / Explorer / Carte / Sauvegardés / Profil ; Match, Drop, Quiz, Top et ADN déplacés dans Profil |
| U5 | IMPORTANT | Fiche événement mobile : **deux** boutons « Voir la source » (un fixe, un dans la page) + 3 couches fixes (header, CTA, bottom nav) ; le CTA principal dit « Voir la source » au lieu de « Réserver » ; affichage brut « Source : paris_opendata » ; bloc « Aucun avis » sur un événement futur | Friction et effet amateur | Un seul CTA fixe « Réserver / Infos & billets » ; source présentée humainement ; avis seulement après l'événement |
| U6 | IMPORTANT | Carte mobile : fenêtre de 480 px suivie du footer ; limitée à 500 événements ; points superposés impossibles à cliquer au même lieu ; « Voir sur la carte » ne centre pas | La fonction stratégique « autour de moi » ne marche pas | Carte plein écran + panneau de liste ; clusters natifs GeoJSON ; regroupement par lieu ; synchronisation avec l'URL |
| U7 | MOYEN | Cartes événement : catégorie en majuscules violettes, puis titre, date en gris clair, lieu, prix ; aucun « pourquoi » ; prix « 30 € — 12 € » ; « Tarif sur place » | Décision difficile | Hiérarchie : **quand** (relatif : « ce soir 20 h », « jusqu'au 12 nov ») → **quoi** → **où** (arrondissement) → **prix** ; une accroche ou un badge de raison |
| U8 | MOYEN | `/ce-soir` mobile : 48 grandes cartes empilées (20 000 px) | Défilement interminable | Liste compacte groupée par créneau (18 h, 20 h, 22 h+) |
| U9 | MOYEN | Recherche peu claire : 3 champs différents (hero IA, SearchBar, filtres) | Confusion | Une seule entrée « Je veux sortir… » |
| U10 | MINEUR | Emojis partout dans les titres et la navigation (🎲, 🔥, 🏆, ❤️) | Ton enfantin, pas premium | Iconographie sobre, emoji seulement en accent |

### 2.4 UI et direction artistique

**À garder :**
- le logotype PANAME**CLUB** (noir + violet) ;
- le hero sombre ;
- le violet de marque ;
- Inter ;
- les cartes à grandes photos.

**À corriger :**
- **Contraste :** `--color-text-muted #A3A3A3` sur `#FAFAFA` = 2,4:1, non conforme AA. C'est la couleur des dates et des lieux partout. Footer `white/30`.
- **Lisibilité :** textes de 9 à 11 px.
- **Mise en page :** 10 tuiles de catégories identiques à emojis, une grille générique.
- **Rythme :** aucune variation entre les sections.
- **Polices :** Google Fonts bloquant le rendu, avec 7 graisses.
- **Styles manquants :**
  - `prose` utilisée sans le plugin typography, donc articles non stylés ;
  - favicon et icônes PWA absents (le manifest pointe vers des fichiers inexistants) ;
  - `og-default.png` absent.

### 2.5 SEO

| # | Sév. | Problème | Solution |
|---|---|---|---|
| S-1 | CRITIQUE | Pages qui ne finissent jamais de charger pour les robots (B1) | B1 |
| S-2 | IMPORTANT | Événements passés servis en 200, indexables, JSON-LD `EventScheduled` / `InStock` | noindex + `EventStatus` + bandeau ; 410 après 6 mois |
| S-3 | IMPORTANT | Sitemap : plafonné à 2 000 événements / 500 lieux (lieux non triés, parfois vides) ; `lastmod = now` partout ; inclut `/match`, `/drop`, `/quiz` et `/top` ; exclut les expositions en cours | `generateSitemaps` découpé ; vrais `lastmod` ; uniquement les lieux avec des événements à venir |
| S-4 | IMPORTANT | 24 000 pages AlloCiné « film × cinéma × jour » = contenu dupliqué et pauvre | Expirer, puis une page par film ou une table de séances |
| S-5 | IMPORTANT | `/evenements?q=` indexable et déclenche le LLM (SearchAction) | noindex + `Disallow: /*?q=` |
| S-6 | MOYEN | Pas de canonical sur `/evenements` ni `/evenements/[slug]` ; marque doublée dans les titles (« Collections — Paname Club \| Paname Club ») | Corriger |
| S-7 | MOYEN | JSON-LD : `performer` = titre de l'événement ; `endDate` inventée ; image de repli inexistante | Corriger |
| S-8 | MOYEN | Pages `/paris/[zone]` pauvres (filtres inopérants, arrondissement NULL en base) | Après D9 : vraies pages locales (ce soir dans le 11e, lieux phares) |
| S-9 | MOYEN | Articles IA auto-publiés sans relecture (risque « scaled content ») | Brouillon + relecture ; moins d'articles, meilleurs |

### 2.6 Performance

| # | Sév. | Problème | Mesure | Solution |
|---|---|---|---|---|
| P-1 | CRITIQUE | Fonctions Vercel en **iad1** (USA), base à Paris | En-tête `x-vercel-id: cdg1::iad1` ; 7 à 13 requêtes, donc plusieurs allers-retours transatlantiques | `regions: ["cdg1"]` |
| P-2 | CRITIQUE | Homepage dynamique à chaque requête (`cookies()` annule `revalidate=60`), HTML de **605 à 715 Ko** | Lignes complètes (descriptions de plusieurs Ko) envoyées à un `EventCard` client, sérialisées deux fois | Sélection des seuls champs utiles ; EventCard en composant serveur ; homepage anonyme en ISR ; « Pour toi » chargé côté client |
| P-3 | IMPORTANT | Requêtes lentes | « Dernière chance » : 339 ms en moyenne, scan séquentiel, aucun index sur `end_date` ; « Populaire » : 178 ms ; carte : 500 lignes complètes par appel (22,6 M lignes cumulées, probable cause du quota d'egress) | 5 index partiels + suppression de 7 index en double ; cache ; carte en JSON léger |
| P-4 | IMPORTANT | `/_next/image` accepte n'importe quel hôte | Quota d'optimisation Vercel brûlé | Liste blanche des domaines, ou `unoptimized` pour les images scrapées |
| P-5 | MOYEN | Google Fonts bloquant, spinner pleine page à chaque navigation, prefetch de toutes les cartes | — | `next/font` ; skeletons par route ; `prefetch={false}` |
| P-6 | MOYEN | Middleware `getUser()` (appel réseau) sur toutes les requêtes, y compris les prefetchs | — | Matcher limité |

### 2.7 Accessibilité

| # | Sév. | Problème | Solution |
|---|---|---|---|
| A-1 | IMPORTANT | `maximumScale: 1` bloque le zoom (WCAG 1.4.4) | Supprimer |
| A-2 | IMPORTANT | Contraste du texte secondaire à 2,4:1 | `#737373` ou plus foncé |
| A-3 | MOYEN | Champs de recherche sans label ; autocomplétion sans rôles combobox/listbox | — |
| A-4 | MOYEN | Boutons icône sans nom (fermer, localiser, étoiles, chevrons) ; pas de `aria-expanded` / `aria-pressed` | — |
| A-5 | MOYEN | Marqueurs de carte non focusables ; `div` cliquables ; pas de `prefers-reduced-motion` | — |
| A-6 | MINEUR | `h3` sans `h2` dans le footer ; emojis lus par les lecteurs d'écran | — |

### 2.8 Architecture

| # | Sév. | Problème | Solution |
|---|---|---|---|
| R-1 | IMPORTANT | Aucun contrat de données entre scrapers et base (dictionnaires libres) | Modèle pydantic `EventIn` + validation |
| R-2 | IMPORTANT | Dérive du schéma : tables créées hors migrations ; `pg_trgm` utilisé mais jamais déclaré | Migration baseline (introspection) |
| R-3 | IMPORTANT | Trois formats de documents Meilisearch, deux extracteurs de mots-clés (Python et TS), synchronisations concurrentes | Une seule synchronisation planifiée (index swap) |
| R-4 | MOYEN | Pas de modèle « œuvre / séance » (film, pièce jouée 3 mois) | Table `occurrences` (à prévoir pour le cinéma et le théâtre) |
| R-5 | MOYEN | Multi-ville impossible (`city` par défaut « Paris », bbox codée en dur) | Ajouter `city_id` le moment venu ; pas urgent |
| R-6 | MOYEN | Recommandations : `taste_profiles` jamais lus ; aucun signal exploité | Après P1 : score de pertinence simple (intention + horaire + distance + qualité) |
| R-7 | MINEUR | Environ 2 500 lignes de gamification pour 27 utilisateurs (1 inscription en 30 jours) | Geler, sortir de la navigation |

### 2.9 Sécurité

| # | Sév. | Problème | Solution | Risque |
|---|---|---|---|---|
| X-1 | CRITIQUE | **RLS désactivé sur les 20 tables** + clé publishable dans le JS public + grants complets pour anon (SELECT/INSERT/UPDATE/DELETE/TRUNCATE). E-mails des utilisateurs lisibles via `/rest/v1/users`. **Problème RGPD.** | `ENABLE RLS` + `REVOKE` pour anon et authenticated : le client n'utilise supabase-js que pour l'auth, toutes les données passent par Drizzle (rôle postgres, propriétaire, non soumis au RLS). Vérifier `rolbypassrls` avant | faible |
| X-2 | CRITIQUE | XSS stockée : HTML des articles générés par l'IA rendu avec `dangerouslySetInnerHTML` sans nettoyage (`news/[slug]/page.tsx:212`) ; cookies `sb-*` non HttpOnly | sanitize-html (liste blanche) | faible |
| X-3 | IMPORTANT | XSS via le JSON-LD (`</script>` non échappé, 5 pages) et via l'infobulle de la carte (`innerHTML`) ; amplifiée par `html.unescape` dans `normalize.py` | `safeJsonLd()` ; `textContent` | nul |
| X-4 | IMPORTANT | Next 15.5.14 : 41 advisories, dont 2 critiques (RCE via Image Optimization) | `next@15.5.x` (dernier patch) ; drizzle 0.45 | faible |
| X-5 | IMPORTANT | IA et newsletter sans rate limiting ni longueur maximale ; réabonnement forcé des désinscrits | Upstash ratelimit ; zod ; double opt-in | faible |
| X-6 | MOYEN | Redirection ouverte dans `auth/callback` (`next=@evil.com`) ; aucun en-tête de sécurité ; clé master Meilisearch côté web + filtre interpolé | Corriger ; clé de recherche seule | faible |
| X-7 | MINEUR | Workflow sans `permissions:` ; Dockerfile en root ; comparaison des secrets cron non constante en temps | Corriger | nul |

**Aucun secret dans l'historique git.** La clé service role n'est utilisée nulle part.

---

## 3. Plan d'amélioration (Phase B)

### P0 : hotfix (site en panne, données fausses, sécurité). Environ 2 à 3 jours

| # | Chantier | Fichiers | Risque |
|---|---|---|---|
| P0-1 | **RLS + REVOKE** (migration SQL, après vérification du rôle Drizzle) ; vérifier dans les logs PostgREST si des accès suspects ont eu lieu | migration | faible |
| P0-2 | **Disponibilité** : région `cdg1` ; postgres.js avec `statement_timeout`, `max` à 8 et `max_lifetime` ; transaction pooler ; middleware limité ; `prefetch={false}` ; homepage anonyme en ISR ; `revalidate` sur les fiches | `vercel.json`, `packages/db`, `middleware.ts`, pages | moyen |
| P0-3 | **Index** : 5 index partiels (CONCURRENTLY) et suppression des 7 en double | migration | faible |
| P0-4 | **Temps Paris** : `lib/paris-time.ts` unique ; définitions ce soir, demain, week-end (vendredi 18 h → dimanche) ; affichage `timeZone` ; « horaire non communiqué » | ~15 fichiers | moyen |
| P0-5 | **Événements en cours** : filtre sur la date de fin partout ; job d'expiration ; fiche « Terminé » + noindex | requêtes, cron | moyen |
| P0-6 | **Sources** : désactiver TMDB, le repli AlloCiné, lebonbon, eventbrite (hors Paris) et les 7 spiders morts ; corriger « gratuit » ; passer en `rejected` les lignes fausses déjà en base (lebonbon, infoconcert faux gratuits, hors Île-de-France, business) via une migration réversible (statut, sans suppression) | scrapers, SQL | faible |
| P0-7 | **Ingestion** : SAVEPOINT par événement ; vrais logs ; workflow qui échoue en cas d'anomalie ; cron sorti du quota GitHub | `ingest.py`, `cron.py`, workflow | faible |
| P0-8 | **XSS** : sanitize, `safeJsonLd`, infobulle carte ; `unescape` corrigé ; montée Next en version patch | ~8 fichiers | faible |
| P0-9 | **Outillage minimal** : tsconfig des packages, ESLint, CI GitHub (typecheck + lint + build), Vitest | config | faible |

### P1 : UX majeure (rendre la promesse vraie). Environ 1 semaine

1. **Navigation :**
   - bottom nav **Ce soir / Explorer / Carte / Sauvegardés / Profil** ;
   - header réduit à 4 liens ;
   - Match, Drop, Quiz, Top et ADN déplacés dans Profil, sans suppression.
2. **Carte événement repensée :**
   - date relative en premier (« Ce soir · 20 h », « Jusqu'au 12 nov. ») ;
   - arrondissement ;
   - prix fiable (« Gratuit », « Dès 12 € », « Prix non communiqué ») ;
   - un badge « raison » (Dernière chance, Gratuit, Près de toi, Coup de cœur) ;
   - variante compacte pour les listes.
3. **Fiche événement :**
   - un seul CTA fixe « Réserver / Infos » avec tracking ;
   - source présentée humainement ;
   - avis seulement après la date ;
   - « Voir sur la carte » qui centre réellement la carte.
4. **`/ce-soir`** : groupé par créneau (en ce moment / 18-20 h / 20-22 h / tard), en vue compacte.
5. **Recherche unique** : `/evenements?q=` branché sur Meilisearch, avec redirection depuis `/recherche`.
6. **Filtres** : seulement ceux qui marchent, synchronisés avec l'URL ; correction des arrondissements.
7. **États** :
   - skeletons par route ;
   - empty states utiles (« Rien ce soir dans le 11e, voici le 10e et le 3e ») ;
   - `error.tsx` par section ;
   - aucun spinner pleine page.
8. **Accessibilité** : zoom, contrastes, labels, combobox.

### P2 : produit à fort impact. Environ 2 semaines

1. **Homepage éditoriale**, construite sur les données réelles (environ 600 événements sur 7 jours, environ 100 par jour) :
   - Hero « Je veux sortir… » avec chips d'intention (ce soir, maintenant, à deux, entre amis, gratuit, près de moi, moins de 20 €, original) et 3 résultats immédiats sous le hero, sans changer de page ;
   - « Ce soir à Paris » : 3 choix forts argumentés, pas une rangée de 20 ;
   - un bloc interactif (carte miniature « Autour de toi » ou bouton Surprise) ;
   - « Ce week-end » sous forme de mini-programme vendredi, samedi, dimanche ;
   - « Les expos du moment » (enfin alimentées), « Dernière chance », « Gratuit cette semaine » ;
   - une sélection Paname Club éditée à la main (table `featured`) ;
   - des sections qui alternent les formats (grande carte, liste, grille, carte) au lieu de 10 carrousels identiques.
2. **IA utile et honnête** :
   - Haiku 4.5 traduit la phrase en filtres **visibles et modifiables** (« Ce soir · 11e · moins de 30 € · musique ou spectacle ») ;
   - résultats classés par un score transparent, avec une ligne « pourquoi » par résultat ;
   - cache par requête normalisée, rate limiting, budget plafonné, repli explicite.
3. **Carte** :
   - plein écran sur mobile, avec un panneau de liste glissable synchronisé avec la zone visible ;
   - clusters GeoJSON natifs et regroupement par lieu ;
   - géolocalisation avec gestion des erreurs ;
   - URL qui conserve la position et les filtres ;
   - JSON léger mis en cache ;
   - les 3 600 événements vivants, au lieu des 500 actuels.
4. **Qualité des données (v2)** :
   - validation pydantic, score et `is_published` (une semaine en mode observation) ;
   - re-géocodage BAN et arrondissements ;
   - fusion des lieux en double ;
   - déduplication entre sources ;
   - prix à 3 états ;
   - extension d'OpenAgenda aux agendas des grands lieux parisiens.
5. **Analytics** : Plausible (ou Vercel Analytics) avec un funnel simple : visite → découverte (intention ou filtre) → ouverture d'un événement → clic sortant. Liste des événements suivis : section 4.
6. **SEO** : sitemaps découpés et réels, canonicals, JSON-LD corrigé, pages arrondissement utiles, noindex sur `?q`.

### P3 : polish et dette

- `next/font` ;
- fiche « œuvre et séances » pour le cinéma et le théâtre ;
- collections dynamiques ;
- articles en brouillon avec relecture ;
- nettoyage des dépendances et routes mortes ;
- migration baseline Drizzle ;
- en-têtes de sécurité et CSP (Report-Only d'abord) ;
- tests E2E Playwright sur les parcours principaux ;
- `prefers-reduced-motion`.

### Tests prévus

- **Vitest :** `paris-time` (ce soir, demain, week-end, passage à l'heure d'hiver le 25 octobre, minuit), formatage des prix, filtres d'arrondissement, `safeJsonLd`, parsing de l'intention.
- **pytest :** `parse_price_fr`, `parse_date_fr`, `to_utc_paris`, validation et score, déduplication.
- **Playwright :** homepage, ce soir, recherche, fiche événement, carte, en mobile et desktop.

---

## 4. Plan de tracking (minimal, sans données personnelles)

| Événement | Propriétés |
|---|---|
| `search` | longueur, nombre de résultats, ia: ok/fallback |
| `intent_chip` | id |
| `filter` | type |
| `event_open` | origine (section) |
| `outbound_click` | domaine, source |
| `map_open` | — |
| `map_select` | — |
| `surprise` | — |
| `save` | — |
| `newsletter_signup` | — |
| `collection_open` | — |

**Funnel :** visite → découverte → `event_open` → `outbound_click`.
