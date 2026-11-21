# API de l'appli mobile et mise en service

L'appli (apps/mobile) lit le site par son API. Contrat typé, partagé avec l'appli :
`src/lib/api-v1/contract.ts` (les routes vérifient leurs réponses avec `satisfies`).

## Connexion

Toutes les routes « membre » passent par `getSessionUser()` (`app/club/_lib/api.ts`),
qui accepte désormais **`Authorization: Bearer <jeton d'accès Supabase>`** en plus des
cookies du site. Le jeton est vérifié par le serveur d'authentification Supabase
(`lib/supabase/bearer.ts`). Rien ne change pour le site.

## Routes ajoutées

| Route | Rôle | Cache |
|---|---|---|
| `GET /api/v1/home` | Accueil (mêmes requêtes que `app/page.tsx`) | CDN 2 min |
| `GET /api/v1/meta` | Catégories, ambiances, collections, arrondissements | CDN 1 h |
| `GET /api/v1/events/[slug]` | Fiche (libellés à l'heure de Paris, bouton principal, artistes, autres dates, « Tu aimeras aussi ») ; 308 `{redirect}` pour un doublon | CDN 5 min |
| `GET /api/v1/venues/[slug]` | Fiche lieu + 40 prochaines sorties | CDN 5 min |
| `GET /api/v1/works/[slug]?kind=work\|film` | Dates d'une œuvre ou séances d'un film | CDN 5 min |
| `GET /api/v1/club` | Le Club : Drop, défi, Top, plus vues, plus gardées, coups de cœur ; niveau et badges si connecté | privé |
| `GET /api/v1/me` | Profil : gardées, J'y vais, suivis, réglages d'alertes (crée la fiche membre) | privé |
| `PATCH /api/v1/me` | Réglages d'alertes, dont `notifyDrop` | privé |
| `DELETE /api/v1/me` `{confirm:"SUPPRIMER"}` | Suppression définitive du compte (`lib/api-v1/account.ts`) | privé |
| `POST/DELETE /api/v1/push` | Inscrire / oublier le jeton Expo de l'appareil | privé |
| `GET/POST /api/cron/drop` | Notification du Drop du lundi (Vercel Cron, lundi 08:00 UTC) ; `?dry=1` | Bearer `CRON_SECRET` |
| `GET /.well-known/apple-app-site-association` | Liens universels iOS | 1 h |
| `GET /.well-known/assetlinks.json` | Liens d'appli Android | 1 h |
| Page `/suppression-compte` | Suppression du compte depuis le site (exigée par Google Play) | — |

Routes existantes appelées telles quelles : `/api/events`, `/api/map`, `/api/suggest`,
`/api/discover`, `/api/saves`, `/api/attendance`, `/api/follows`, `/api/alerts/settings`,
`/api/swipe`, `/api/drop`, `/api/taste-quiz`, `/api/profile/adn`, `/api/reviews`,
`/api/views`, `/api/artists/*`.

## Notifications

- Les jetons de l'appli vont dans `push_subscriptions` avec `kind = 'expo'`
  (migration `0012`). Les alertes artistes (`lib/alerts-server.ts`) partent vers le
  navigateur (Web Push, clés VAPID) **et** vers l'appli (Expo Push, `lib/push-server.ts`).
- Expo renvoie `DeviceNotRegistered` quand l'appli est désinstallée : le jeton est supprimé.
- `EXPO_PUSH_DISABLED=1` coupe les envois vers l'appli ; `EXPO_ACCESS_TOKEN` seulement si la
  « sécurité renforcée » des notifications est activée dans le projet Expo.

## Variables Vercel (Production)

| Variable | Valeur |
|---|---|
| `APPLE_TEAM_ID` | `542CN5886Z` (équipe JUNO ; valeur par défaut) |
| `IOS_BUNDLE_ID` | `fr.panameclub.app` (valeur par défaut) |
| `ANDROID_SHA256_FINGERPRINTS` | Empreinte SHA-256 du certificat de signature Google Play (Play Console → Intégrité de l'application) |
| `EXPO_ACCESS_TOKEN` | Facultatif |

## Ordre de mise en ligne

1. Jouer `packages/db/sql/0012_appli_mobile.sql` (additive, rejouable).
2. Déployer le site (branche `feat/appli-mobile`).
3. Vérifier : `GET /api/v1/home`, `GET /.well-known/apple-app-site-association`,
   `POST /api/cron/drop?dry=1` (avec `CRON_SECRET`), `POST /api/cron/alerts?dry=1`.
4. Seulement ensuite : builds de l'appli et soumission aux stores.

Retour arrière : redéployer la version précédente du site, puis
`0012_appli_mobile_RETOUR_ARRIERE.sql` si besoin.
