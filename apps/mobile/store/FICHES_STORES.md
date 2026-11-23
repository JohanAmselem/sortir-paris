# Fiches App Store et Google Play · Paname Club

*Brouillon du 21/11/2026, mis à jour pour la 2.0 (refonte « Nuit » du 23/11/2026). À relire avant soumission.*

## Identité

| Champ | Valeur |
|---|---|
| Nom | Paname Club |
| Sous-titre (App Store, 30 caractères max.) | Que faire à Paris ce soir |
| Identifiant | `fr.panameclub.app` (iOS et Android) |
| Vendeur affiché | JUNO |
| Catégorie principale | Divertissement |
| Catégorie secondaire | Style de vie |
| Langue | Français (France) |
| Prix | Gratuit, sans achat intégré |
| URL de support | https://www.panameclub.fr/mentions-legales (contact@panameclub.fr) |
| Politique de confidentialité | https://www.panameclub.fr/confidentialite |
| Suppression du compte (Google) | https://www.panameclub.fr/suppression-compte |

## Texte promotionnel (170 caractères max.)

Concerts, expos, théâtre, sorties gratuites : ce soir, ce week-end ou dans six mois, toutes les sorties de Paris, et une alerte quand tes artistes passent.

## Description

Que faire à Paris ce soir ? Et le mois prochain ? Paname Club te montre tout, simplement.

**Sortir**
Ce soir, demain, ce week-end ou près de toi : notre choix en grandes photos, chacun avec sa raison (gratuit, moins de 15 €, dernier jour…), puis les envies, le week-end, les grosses dates à venir et les expos du moment.

**Agenda : jusqu’en 2028**
Une seule recherche qui comprend « jazz samedi », « Angèle en mars » ou « concert 14 février ». Les mois défilent avec leur nombre de sorties, un jour se choisit d’un geste, et la liste est rangée par jour, année comprise.

**Tout Paris, chaque jour à jour**
Plus de 20 000 sorties : concerts, expositions, théâtre, humour, danse, cinéma, festivals, ateliers, visites, soirées. Des grandes scènes (Accor Arena, Zénith, Olympia, Philharmonie…) aux petites salles.

**La carte et « autour de moi »**
Ce qui se passe près de toi, ce soir, ce week-end ou ce mois-ci, lieu par lieu.

**Alertes concerts**
Suis tes artistes : une notification quand ils annoncent une date à Paris, quand la billetterie ouvre, et la veille du concert.

**Mes sorties, partout**
Garde une sortie, dis « J’y vais », ajoute-la à ton calendrier, trouve l’itinéraire, partage-la. Tes sorties restent disponibles sans réseau.

Les réservations se font sur les billetteries et les sites des lieux. Les horaires et les prix sont à vérifier auprès de l’organisateur.

## Notes de version 2.0

Nouvelle Paname Club : un nouveau look sombre, plus simple. Un Agenda pour trouver les sorties des mois à venir (jusqu’en 2028), une recherche qui comprend les dates, des photos en grand, et Mes sorties rangées comme des billets.

## Mots-clés (App Store, 100 caractères max., séparés par des virgules)

sortir,concert,expo,théâtre,ce soir,week-end,gratuit,agenda,spectacle,humour,jazz,musée,culture

(« paris » retiré : il est déjà dans le sous-titre, et la liste dépassait 100 caractères.)

## Note pour la revue Apple (App Review Information)

> Paname Club est une appli native (React Native / Expo) pour choisir une sortie culturelle à Paris. Elle ne se contente pas d'afficher un site : agenda natif (mois, jours, recherche qui comprend les dates), carte native avec regroupement et « autour de moi » (position demandée au geste), notifications natives (alertes artistes : nouvelle date, ouverture de billetterie, rappel la veille ; idées du lundi), ajout au calendrier par le formulaire du système, itinéraire, partage, sorties gardées disponibles hors connexion, retour haptique. Aucun contenu publié par les membres (pas d’avis, pas de messages).
>
> Tout se consulte sans compte. La connexion (Se connecter avec Apple, Google ou e-mail avec code) sert à synchroniser les sorties et à recevoir les alertes. La suppression du compte se fait dans l'appli : Mes sorties → Compte et réglages → Supprimer mon compte.
>
> Compte de démonstration : voir les identifiants ci-dessous (connexion par e-mail : le code est envoyé à cette boîte, que nous consultons pendant la revue ; à défaut, utilisez « Se connecter avec Apple »).
>
> Les réservations se font sur les sites des billetteries, dans le navigateur intégré : aucune vente dans l'appli.

## Confidentialité de l'appli (App Store « App Privacy »)

| Donnée | Collectée | Liée à l'identité | Pistage | Usage |
|---|---|---|---|---|
| Adresse e-mail | Oui | Oui | Non | Fonctionnement de l'appli (compte) |
| Nom | Oui (si donné par Apple / Google) | Oui | Non | Fonctionnement de l'appli |
| Identifiant utilisateur | Oui | Oui | Non | Fonctionnement de l'appli |
| Interactions avec l'appli (sorties gardées, suivis) | Oui | Oui | Non | Fonctionnement, personnalisation |
| Données d'usage (écrans, fonctions) | Oui (PostHog UE) | Non | Non | Analyse |
| Position approximative | Oui, par prudence : les coordonnées arrondies (~100 m) partent avec la recherche « près de moi » et peuvent rester dans les journaux techniques ; jamais enregistrées dans le compte | Non | Non | Fonctionnement de l'appli |
| Identifiants publicitaires | Non | — | — | — |

Pas de demande ATT (aucun pistage entre applis).

## Sécurité des données (Google Play « Data safety »)

- Données collectées : e-mail, nom, identifiant, interactions, données d'usage.
- Partagées avec des tiers : non (prestataires techniques seulement : hébergement, envoi des notifications).
- Chiffrées en transit : oui.
- Suppression possible : oui, dans l'appli et sur https://www.panameclub.fr/suppression-compte.

## Classification d'âge

12+ (iOS) / 12 ans (IARC) : références à l'alcool possibles dans les descriptions de soirées, aucun contenu publié par les membres (2.0), pas de jeux d'argent, pas de navigateur libre (le navigateur intégré n'ouvre que les liens des fiches).

## Captures d'écran

Faites le 21/11 (simulateur iPhone 17 Pro Max, 1320 × 2868, heure 9:41) : `captures/ios-6.9/`.
Android (émulateur Pixel, 1080 × 2400) : `captures/android/`, et `captures/android-play/` en 1200 × 2400
(Google Play refuse un grand côté de plus de 2 fois le petit). Tout est en JPEG, sans transparence.
L'ordre ci-dessous est celui des fichiers.

### Liste

1.0 (21/11) : « Je veux sortir… », le choix de ce soir, une fiche concert, la carte, Match, le Drop, Mes sorties, Alertes concerts.

2.0 (faites le 23/11, simulateur iPhone 17 Pro Max, heure 9:41) : `captures/ios-6.9-v2/` (1320 × 2868),
`captures/ios-6.3-v2/` (1206 × 2622, pour l'emplacement obligatoire « iPhone avec Dynamic Island, écran moyen »
d'App Store Connect) et `captures/android-v2/` (1080 × 2160, bandes sombres sur les côtés). Six écrans :

1. Sortir : « Ce soir à Paris » et notre choix
2. Les grosses dates (grandes salles, mois à venir)
3. Agenda : les mois et les jours, « Angèle en mars »
4. Une fiche concert (Réserver avec le prix, Garder, suivre l’artiste)
5. La carte sombre « autour de moi »
6. Mes sorties en billets

(La 7e, Alertes concerts, n'a pas été faite : « Mes artistes » est visible sur la 6e.)
