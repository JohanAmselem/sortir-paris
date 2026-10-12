# Spotify — demande d’Extended Quota Mode

L’app Spotify de Paname Club est en **development mode** : seuls 25 comptes ajoutés à la main
(Dashboard Spotify → app → *User Management*) peuvent utiliser l’import. Tant que l’Extended
Quota n’est pas accordé, le bouton « Importer depuis Spotify » reste **masqué** sur le site.

## Activer le bouton

Il faut les trois variables d’environnement (Vercel) :

- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` — identifiants de l’app Spotify ;
- `NEXT_PUBLIC_SPOTIFY_IMPORT=1` — affiche les boutons (Mes artistes, onboarding). Sans elle,
  le code reste en place mais rien n’est montré (`spotifyImportEnabled()` dans `src/lib/spotify.ts`).

Après l’accord de Spotify : mettre `NEXT_PUBLIC_SPOTIFY_IMPORT=1` et redéployer (variable
publique : prise en compte au build).

## Ce que fait l’import (résumé en français)

- Le membre, connecté, clique « Importer mes artistes » sur `/compte/artistes` (ou à l’étape
  « Tes artistes » de l’onboarding).
- Autorisation OAuth (authorization code, secret côté serveur), scopes **`user-top-read`** et
  **`user-follow-read`** uniquement.
- Le serveur lit `/me/top/artists` (50, moyen terme) et `/me/following?type=artist` (50), garde
  **seulement les noms d’artistes**, et crée des suivis « artiste » (100 suivis au maximum).
- Le jeton d’accès est utilisé pendant la requête puis oublié : **aucun jeton n’est stocké**
  (ni access token, ni refresh token). Aucune donnée Spotify n’est partagée ni revendue.
- Les suivis servent aux « Alertes concerts » : e-mail ou notification quand l’artiste annonce
  une date à Paris, quand la billetterie ouvre, et la veille du concert.
- Politique de confidentialité : https://www.panameclub.fr/confidentialite

## Captures d’écran à fournir

1. Page publique `/alertes-concerts` (présentation du service).
2. `/compte/artistes` avec le bouton « Importer depuis Spotify » visible (compte de test
   allow-listé, flag activé en preview).
3. L’écran de consentement Spotify affichant les deux scopes.
4. `/compte/artistes` après l’import : message « N artistes importés » et liste des artistes
   suivis avec leurs prochaines dates.
5. Un exemple d’e-mail d’alerte (nouvelle date) ou de bienvenue « Ton alerte est activée ».
6. La page `/confidentialite` (section prestataires, ligne Spotify).
7. Le logo Paname Club et un lien vers https://www.panameclub.fr.

Penser aussi à indiquer dans le formulaire : l’URL de redirection
`https://www.panameclub.fr/api/spotify/callback`, le site web, et un e-mail de contact
(contact@panameclub.fr).

## Texte à coller dans le formulaire (anglais)

**App name:** Paname Club

**Website:** https://www.panameclub.fr

**What does your app do?**

> Paname Club (www.panameclub.fr) is a free French website listing concerts and cultural events
> in Paris and its inner suburbs. Its "Alertes concerts" feature lets members follow artists and
> get notified (by e-mail or web push) when a followed artist announces a new date in Paris, when
> ticket sales open, and the day before a concert they plan to attend.
>
> The Spotify integration is an optional, one-time import: a logged-in member clicks "Import my
> artists", authorizes our app, and we read the names of their top artists and followed artists to
> pre-fill their list of followed artists on Paname Club. Members can remove any artist at any
> time. The import is only ever triggered by the member.

**Which scopes do you request and why?**

> - `user-top-read`: read the member's top artists (GET /v1/me/top/artists) to suggest the artists
>   they listen to most.
> - `user-follow-read`: read the artists the member follows (GET /v1/me/following?type=artist).
>
> We request no other scope. We never modify the member's Spotify account, playlists or library.

**How do you handle Spotify data?**

> - Authorization code flow; the client secret stays on our server.
> - The access token is used only during the import request and then discarded. We store no
>   access token and no refresh token, so we keep no access to the member's Spotify account.
> - We only keep the artist names, as artists the member follows on Paname Club. We do not store
>   any other Spotify data (no listening history, no profile data, no Spotify IDs).
> - Spotify data is never sold, shared with third parties, used for advertising, or used to train
>   any model.
> - Members can unfollow any artist at any time, and can ask for their account and data to be
>   deleted at contact@panameclub.fr.
> - Privacy policy: https://www.panameclub.fr/confidentialite

**Does your app display Spotify content or use the Spotify logo?**

> The import button is labelled "Importer depuis Spotify" (Import from Spotify). We do not stream
> or display Spotify content, artwork or metadata other than artist names chosen by the member.

**Expected number of users:** [à compléter — estimation réaliste du nombre de membres]

**Contact:** contact@panameclub.fr — JUNO (SARL), 21 rue du Buisson Saint-Louis, 75010 Paris, France.
