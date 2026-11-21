# Paname Club · appli iPhone et Android

Appli Expo (SDK 58, React Native 0.88, Expo Router) branchée sur l'API du site
(`/api/v1/*` et les routes membres existantes). Plan et décisions :
`PLAN_APP_PANAME_CLUB.md` (21/11/2026).

## Ce qu'elle contient

| Onglet / écran | Rôle |
|---|---|
| Ce soir | « Je veux sortir… » (pastilles et phrase libre), le choix de ce soir, le week-end, les grandes scènes, les expos, la dernière chance, le gratuit |
| Explorer | Recherche avec suggestions, filtres (quand, catégories, prix, quartier, ambiance), sélections |
| Carte | Un point par lieu, regroupements, « autour de moi », panneau des sorties du lieu |
| Le Club | Niveau, XP, badges, Drop du lundi, Match, quiz « Tu préfères », ADN, défi de la semaine, Top des membres |
| Moi | Sorties gardées et « J'y vais » par date (hors connexion), artistes et lieux suivis, réglages |
| Fiches | Événement (Réserver, Garder, J'y vais, calendrier, itinéraire, partage, artistes à suivre, avis), lieu, œuvre, film |

Sans compte, tout se consulte ; les sorties gardées, les swipes et le quiz restent sur
le téléphone et sont repris à la connexion (Apple, Google, ou e-mail avec code à 6 chiffres).

## Code partagé avec le site

`src/shared/index.ts` importe **en place** des modules purs de `apps/web/src/lib` :
heure de Paris, prix, catégories, quiz, filtres d'URL, contrat de l'API
(`api-v1/contract.ts`). Ne jamais y ajouter d'import serveur (`server-only`, Next, la base).

L'appli est **hors de l'espace pnpm** (`pnpm-workspace.yaml` : `!apps/mobile`) : elle a
son propre `package-lock.json`, et le build Vercel du site ne change pas.

## Lancer en local

Prérequis sur ce Mac : Node 22 (`~/.nvm/versions/node/v22.23.2`), Xcode, CocoaPods
(installé dans `~/.gem/ruby/2.6.0`), Android Studio pour Android.

```bash
cd apps/mobile
npm install
npx expo run:ios          # compile et installe sur le simulateur (première fois : ~10 min)
npx expo start --dev-client
```

Variables (`.env.local`, non commité) :

| Variable | Rôle |
|---|---|
| `EXPO_PUBLIC_API_URL` | Site qui sert l'API (local : `http://localhost:6733`, défaut : production) |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Connexion (valeurs publiques du site) |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Connexion Google (sinon le bouton est masqué) |
| `EXPO_PUBLIC_POSTHOG_KEY` | Mesure d'usage PostHog UE (sinon rien n'est envoyé) |
| `GOOGLE_MAPS_ANDROID_KEY` | Carte sur Android |
| `EAS_PROJECT_ID` | Projet Expo (notifications, mises à jour), donné par `eas init` |

## Publier

EAS Build et EAS Submit (`eas.json` : profils `development`, `preview`, `production`).
Le site doit être déployé **avant** l'appli (l'API `/api/v1` doit exister en production),
et la migration `packages/db/sql/0012_appli_mobile.sql` jouée **avant** le site.
