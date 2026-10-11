# Alertes artistes — mise en service

Les membres suivent des artistes (page **Mes artistes** `/compte/artistes`, bouton « Suivre » sur les pages de concerts, import Spotify). Paname Club les prévient :

- **Nouvelle date** : un concert d'un artiste suivi est ajouté au catalogue (après la date à laquelle le membre a commencé à le suivre) ;
- **Ouverture de billetterie** : la billetterie d'un concert d'un artiste suivi ouvre (entre −12 h et +36 h) ;
- **Rappel la veille** : un événement marqué « J'y vais » commence le lendemain.

Un seul e-mail par membre et par envoi (20 événements au plus), et une seule notification push résumée. Chaque alerte (membre, événement, type) n'est envoyée qu'une fois (table `alert_deliveries`). Sans `RESEND_API_KEY` ni clés VAPID, rien n'est envoyé (la route le signale dans sa réponse JSON).

Tant que ces variables ne sont pas renseignées, le site fonctionne : le bouton Spotify est masqué, les notifications sont annoncées « bientôt ».

## 1. Variables d'environnement (Vercel → Settings → Environment Variables, Production)

| Variable | Rôle | Exemple |
| --- | --- | --- |
| `CRON_SECRET` | Protège `/api/cron/alerts` (déjà utilisé par `/api/cron/daily-articles`) | une longue chaîne aléatoire (`openssl rand -hex 32`) |
| `RESEND_API_KEY` | Envoi des e-mails (déjà utilisé par la newsletter) | `re_…` |
| `ALERTS_FROM` | Expéditeur des alertes (facultatif) | `Paname Club <alertes@panameclub.fr>` (valeur par défaut) |
| `SPOTIFY_CLIENT_ID` | Import Spotify | voir § 3 |
| `SPOTIFY_CLIENT_SECRET` | Import Spotify | voir § 3 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Clé publique VAPID, lue par le navigateur | voir § 4 |
| `VAPID_PUBLIC_KEY` | Même clé publique, côté serveur | voir § 4 |
| `VAPID_PRIVATE_KEY` | Clé privée VAPID (secrète) | voir § 4 |
| `VAPID_SUBJECT` | Contact pour les services push (facultatif) | `mailto:contact@panameclub.fr` (valeur par défaut) |

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` est intégrée au moment du build : **redéploie** après l'avoir ajoutée.

## 2. GitHub : secret `CRON_SECRET`

Dépôt → Settings → Secrets and variables → Actions → **New repository secret** : `CRON_SECRET`, même valeur que sur Vercel.

- `.github/workflows/daily-scrape.yml` appelle `POST /api/cron/alerts` à la fin du job `post` (après chaque scraping, 2 fois par jour) ;
- `.github/workflows/alerts-reminder.yml` appelle `POST /api/cron/alerts?only=reminder` tous les jours à 08:00 UTC.

Sans ce secret, les deux étapes s'arrêtent avec une simple notice.

## 3. Resend (e-mails)

1. Crée un compte sur <https://resend.com> (ou utilise celui de la newsletter).
2. **Domains → Add domain** : `panameclub.fr`, région Europe (`eu-west-1`).
3. Ajoute chez ton registrar DNS les enregistrements affichés (MX et TXT SPF sur le sous-domaine `send`, TXT DKIM `resend._domainkey`), puis **Verify**. Ajoute aussi un DMARC si absent : TXT `_dmarc` → `v=DMARC1; p=none;`.
4. **API Keys → Create API key** (permission « Sending access », domaine `panameclub.fr`) → `RESEND_API_KEY` sur Vercel.
5. Les alertes partent de `alertes@panameclub.fr` (modifiable avec `ALERTS_FROM`, l'adresse doit être sur le domaine vérifié).

Chaque e-mail contient un lien de désinscription (`/alertes/desinscription?token=…`, confirmation en un clic) et les en-têtes `List-Unsubscribe` / `List-Unsubscribe-Post` (désinscription en un clic depuis Gmail, via `POST /api/alerts/unsubscribe`). Le compte gratuit Resend envoie 100 e-mails par jour (3 000 par mois) : passe à l'offre payante si les alertes dépassent ce volume.

## 4. Spotify (import des artistes)

1. Va sur <https://developer.spotify.com/dashboard> → **Create app**.
2. Nom : `Paname Club`, description libre, **Redirect URI** : `https://www.panameclub.fr/api/spotify/callback` (exactement, sans barre finale). Pour tester en local, ajoute aussi `http://127.0.0.1:3000/api/spotify/callback` et mets `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000` dans `.env.local`.
3. API utilisée : **Web API**. Accepte les conditions.
4. **Settings** → copie *Client ID* → `SPOTIFY_CLIENT_ID`, *View client secret* → `SPOTIFY_CLIENT_SECRET`.
5. En mode *Development*, seuls les comptes Spotify ajoutés dans **User Management** (25 au plus) peuvent importer. Pour l'ouvrir à tous les membres, demande l'*extension de quota* depuis le tableau de bord.

Le site demande les droits `user-top-read` et `user-follow-read`, lit les 50 artistes les plus écoutés et 50 artistes suivis, les ajoute aux suivis du membre (limite de 100 suivis) puis oublie le jeton : rien n'est stocké.

## 5. Notifications push (VAPID)

```bash
npx web-push generate-vapid-keys
```

- *Public Key* → `NEXT_PUBLIC_VAPID_PUBLIC_KEY` **et** `VAPID_PUBLIC_KEY` (même valeur) ;
- *Private Key* → `VAPID_PRIVATE_KEY` ;
- `VAPID_SUBJECT` : `mailto:contact@panameclub.fr`.

Ne change plus ces clés ensuite : tous les abonnements existants deviendraient invalides. Le service worker est `public/sw.js`. Sur iPhone (iOS 16.4+), les notifications ne marchent qu'une fois le site ajouté à l'écran d'accueil. Les abonnements refusés par le service push (404 / 410) sont supprimés automatiquement.

## 6. Vérifier

```bash
# Ce qui partirait, sans rien envoyer ni écrire :
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "https://www.panameclub.fr/api/cron/alerts?dry=1" | jq

# Seulement les rappels :
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "https://www.panameclub.fr/api/cron/alerts?only=reminder&dry=1" | jq
```

La réponse donne le nombre d'alertes en attente par type, de membres concernés, d'e-mails et de notifications envoyés, d'abonnements push supprimés et de lignes `alert_deliveries` écrites. Au plus 200 membres par appel : les suivants passent à l'appel suivant.

Les artistes de chaque concert (`event_artists`) et l'ouverture de billetterie (`events.on_sale_at`) sont remplis par les scrapers (Ticketmaster : attractions et `sales.public.startDateTime`). Pour un concert sans artiste connu, la nouvelle date est détectée si le nom suivi apparaît en mot entier dans le titre.
