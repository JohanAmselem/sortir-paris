# Instagram — publication automatique

Paname Club publie tout seul sur Instagram, avec l'API officielle d'Instagram (« Instagram API with Instagram Login », `graph.instagram.com`) :

| Quand (heure de Paris) | Quoi |
| --- | --- |
| Tous les jours à 18h | Carrousel **« Demain à Paris »** : couverture, 8 sorties du lendemain (tous thèmes), image finale « Toutes les sorties sur panameclub.fr » (10 images au plus) |
| Tous les jours à 18h | **Stories par thème** (Concerts, Expos, Théâtre & humour, Gratuit, En famille, Soirées) : seulement les thèmes qui ont au moins 3 bonnes sorties le lendemain ; une couverture puis une image par sortie (5 au plus) |
| Lundi à 8h | Carrousel **« Ta semaine à Paris »** (lundi → dimanche) |
| Jeudi à 12h | Carrousel **« Ton week-end à Paris »** (vendredi soir → dimanche) |

Les brouillons sont **préparés la veille** vers 15h (aperçu dans `/admin/instagram`) puis **publiés automatiquement** à l'heure prévue, sauf si tu les bloques.

## 1. Mise en service (une seule fois)

### 1.1 Compte Instagram professionnel

Dans l'app Instagram : **Paramètres → Type de compte et outils → Passer à un compte professionnel** (Créateur ou Entreprise). Un compte personnel ne peut pas publier par l'API. Aucune page Facebook n'est nécessaire avec la connexion Instagram.

### 1.2 Application Meta

1. Va sur [developers.facebook.com](https://developers.facebook.com/apps) → **Créer une app** (type **Business** si on te le demande). Nom : « Paname Club ».
2. Dans l'app, ajoute le produit / cas d'usage **Instagram**, puis ouvre **Instagram → API setup with Instagram login** (« Configuration de l'API avec la connexion Instagram »).
3. Tant que l'app est en mode développement, seul un compte qui a un rôle sur l'app peut s'y connecter : **Rôles de l'app → Rôles → Ajouter des personnes → Testeur Instagram**, saisis le nom du compte (ex. `panameclub`). Accepte ensuite l'invitation dans Instagram : **Paramètres → Apps et sites web → Invitations de testeur** (ou depuis instagram.com, même menu). Si tu es déjà administrateur de l'app avec ce compte, cette étape peut être inutile.
4. Dans **API setup with Instagram login → 1. Generate access tokens**, clique **Add account**, connecte-toi avec le compte Instagram et accepte les autorisations. Les autorisations nécessaires sont :
   - `instagram_business_basic`
   - `instagram_business_content_publish`
5. Clique **Generate token** à côté du compte et copie le jeton. Le jeton généré dans le tableau de bord est un **jeton longue durée (60 jours)**. La même ligne affiche l'identifiant du compte (`user_id`, une suite de chiffres) : note-le (facultatif, le site le retrouve à partir du jeton).

Si tu obtiens un jeton **courte durée** (par exemple via un flux de connexion maison), échange-le côté serveur, jamais dans le navigateur :

```
GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=<CLÉ SECRÈTE DE L'APP>&access_token=<JETON COURT>
```

La réponse contient `access_token` (60 jours) et `expires_in`.

Pour vérifier un jeton : `GET https://graph.instagram.com/v23.0/me?fields=user_id,username&access_token=<JETON>`. `user_id` est l'identifiant à utiliser pour publier.

> Publier sur **ton propre compte** ne nécessite pas d'examen de l'app par Meta (accès standard). L'examen (« App Review », accès avancé) n'est nécessaire que pour publier sur les comptes d'autres personnes.

### 1.3 Coller le jeton sur le site

1. Connecte-toi sur panameclub.fr avec une adresse autorisée (voir `ADMIN_EMAILS`).
2. Ouvre **https://www.panameclub.fr/admin/instagram** → **Connecter Instagram**.
3. Colle le jeton (et l'identifiant si tu l'as). Le site vérifie le jeton auprès d'Instagram (`/me`), enregistre le nom du compte et le jeton dans la table `instagram_credentials`. **Le jeton n'est jamais réaffiché** (seuls ses 4 derniers caractères).

Le jeton est **renouvelé automatiquement** (`GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token`) par la tâche de publication quand il expire dans moins de 10 jours. Un jeton juste collé n'a pas de date d'expiration connue : il est renouvelé dès qu'il a plus de 24 heures (Instagram refuse avant), puis tous les ~50 jours. Si le jeton expire quand même (tâche arrêtée plus de 60 jours), recommence l'étape 1.2.4.

### 1.4 Variables d'environnement (Vercel)

| Variable | Rôle |
| --- | --- |
| `CRON_SECRET` | Déjà en place : protège `/api/cron/instagram/prepare` et `/api/cron/instagram/publish` |
| `ANTHROPIC_API_KEY` | Déjà en place : accroche des légendes (Claude Haiku). Sans clé, accroche modèle |
| `ADMIN_EMAILS` | Facultatif. Adresses autorisées sur `/admin/instagram`, séparées par des virgules. Par défaut : `contact@studio-juno.fr,johan.amselem@gmail.com` |
| `IG_GRAPH_BASE` | Facultatif. Adresse de l'API, par défaut `https://graph.instagram.com/v23.0` (pour passer à une version plus récente, ex. `v25.0`) |
| `ANTHROPIC_HOOK_MODEL` | Facultatif. Modèle de l'accroche, par défaut celui de la recherche (`claude-haiku-4-5`) |
| `NEXT_PUBLIC_APP_URL` | Déjà en place : adresse publique du site, utilisée pour les images envoyées à Instagram |

### 1.5 GitHub Actions

`.github/workflows/instagram.yml` appelle :
- `POST /api/cron/instagram/prepare` tous les jours à 13:00 UTC (14h ou 15h à Paris) ;
- `POST /api/cron/instagram/publish` toutes les 30 minutes de 05:00 à 18:30 UTC (couvre 8h, 12h et 18h à Paris, heure d'été comme d'hiver).

Il utilise le secret GitHub `CRON_SECRET` (déjà présent pour les alertes). Sans secret, le job s'arrête avec un avis. Lancement manuel possible (**Actions → Instagram → Run workflow**, avec « dry run »).

Test sans rien publier :

```
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://www.panameclub.fr/api/cron/instagram/prepare?dry=1"
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://www.panameclub.fr/api/cron/instagram/publish?dry=1"
```

Tant qu'aucun compte n'est connecté, les deux routes répondent `{"ok": false, "error": "Instagram non connecté"}` (sans erreur ; le `prepare?dry=1` fonctionne quand même pour vérifier la sélection).

## 2. Au quotidien : `/admin/instagram`

- **À venir** : les brouillons du lendemain avec l'aperçu de chaque image (exactement celles qu'Instagram téléchargera), la légende et la liste des sorties.
  - **Bloquer** : la publication ne partira pas (elle reste bloquée). **Débloquer** : elle repart à l'heure prévue (si l'heure est passée de plus de 6 heures, elle est annulée).
  - **Publier maintenant** : publie tout de suite (aussi pour relancer un échec).
  - **Préparer maintenant** : refait la sélection du lendemain (les brouillons non bloqués sont remplacés).
  - Sous chaque sortie : **Exclure la sortie / le lieu / la source**.
- **Récentes** : publications parues (lien vers Instagram), échecs avec le message d'erreur, publications annulées.
- **Exclusions** : liste, ajout, retrait.

Un brouillon non publié 6 heures après son heure est annulé (jamais de publication en retard). Un échec est retenté automatiquement jusqu'à 3 fois (toutes les 30 minutes). Si Instagram ne répond pas au moment de la publication elle-même, la publication n'est **pas** retentée automatiquement (elle a pu partir) : vérifie le compte avant de cliquer « Publier maintenant ».

## 3. Règles de sélection et de contenu

- Uniquement des sorties fiables : horaire connu, lieu connu à Paris ou en petite couronne (92, 93, 94), score de qualité ≥ 70, non annulées, pas de séances de cinéma, pas de sujets administratifs. Les expositions de longue durée ne sont pas dans « Demain » (sauf la story Expos).
- Les lieux phares passent en premier ; un seul événement par lieu ; au plus 2 par catégorie dans un carrousel.
- **Photos** : uniquement l'image de l'événement fournie par nos sources (`image_url`), jamais d'image cherchée ailleurs. Chaque image photo porte le crédit « Photo : <lieu> (via <source>) », et la légende rappelle les sources. Sans photo, photo injoignable ou trop petite (< 600 px de large, vérifié à la préparation et au rendu), l'image est typographique.
- **Légende** : une accroche de 1 à 2 phrases écrite par l'IA **uniquement à partir de la liste des sorties**, puis vérifiée : refusée si elle contient un nom propre, un nombre ou une date absents des données, un hashtag, un lien, plus d'un emoji ou plus de 220 caractères (on prend alors une accroche modèle). La liste des sorties (titre — lieu — jour heure — prix), « Infos à vérifier auprès de l'organisateur », « Lien en bio : panameclub.fr/instagram » et 10 à 15 hashtags fixes par thème sont générés par le site. 2 200 caractères au plus.
- Les stories n'ont pas de légende (Instagram ne la prend pas en charge par l'API).

## 4. Demande de retrait (photo, lieu, organisateur)

1. Dans `/admin/instagram`, ajoute une **exclusion** (lieu, source ou événement). Elle s'applique à toutes les sélections suivantes et aux brouillons déjà préparés (l'image est retirée au moment de publier).
2. **Supprime la publication dans l'app Instagram** (… → Supprimer). L'API avec connexion Instagram ne permet pas de supprimer une publication (seule l'API avec connexion Facebook le permet), le site ne peut donc pas le faire à ta place.

## 5. Limites Instagram (vérifiées dans la documentation Meta, octobre 2026)

- **50 publications par 24 heures glissantes** par compte (`content_publishing_limit` : `quota_total` 50, `quota_duration` 86400 ; une autre page de la doc annonce 100, on retient 50). Un carrousel compte pour 1, **chaque image de story compte pour 1**. Volume prévu : 1 carrousel + au plus 6 × 6 images de stories = 37 par jour (38 le lundi et le jeudi). Le site vérifie le quota avant chaque publication et attend la passe suivante s'il manque de la place.
- 400 conteneurs créés par 24 heures.
- Images **JPEG uniquement**, 8 Mo au plus, sRGB, largeur 320 à 1 440 px, rapport 4:5 à 1,91:1 dans le fil (le site produit du 1080 × 1350, soit 4:5) ; 9:16 conseillé pour les stories (1080 × 1920).
- Carrousel : 10 images au plus ; toutes recadrées au format de la première.
- Légende : 2 200 caractères, 30 hashtags, 20 mentions au plus.
- Instagram télécharge les images à l'adresse publique `https://www.panameclub.fr/api/instagram/media/<id>/<n>.jpg?v=…` (autorisée dans `robots.txt`, non indexée).

## 6. Fichiers

- `src/lib/instagram/` : sélection (`select.ts`), calendrier (`schedule.ts`), légendes (`caption.ts`, `hook.ts`), rendu des images (`render.tsx`, polices Archivo sous licence OFL dans `fonts/`), client API (`graph.ts`, `publish-flow.ts`), base de données (`data.ts`), enchaînement (`pipeline.ts`).
- `src/app/api/cron/instagram/{prepare,publish}/route.ts`, `src/app/api/instagram/media/[postId]/[index]/route.ts`.
- `src/app/admin/instagram/` (privé), `src/app/instagram/page.tsx` (lien en bio, non indexé).
- Tables : `packages/db/sql/0011_instagram.sql`.

Documentation Meta consultée :
- https://developers.facebook.com/docs/instagram-platform/content-publishing
- https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
- https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit
- https://developers.facebook.com/docs/instagram-platform/reference/refresh_access_token
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started
- https://developers.facebook.com/docs/instagram-platform/reference/instagram-media (suppression : connexion Facebook uniquement)
