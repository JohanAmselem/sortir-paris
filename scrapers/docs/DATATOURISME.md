# Brancher DATAtourisme sur Paname Club

DATAtourisme est la base nationale des données touristiques publiques (offices de
tourisme, CRT, CDT). Elle est en open data sous Licence Ouverte 2.0 (Etalab). Le
spider `spiders/datatourisme.py` en tire les **fêtes et manifestations** de Paris et
de la petite couronne (75, 92, 93, 94).

> **Important (vérifié le 9 octobre 2026).** Depuis le **1er octobre 2026**, la
> plateforme Diffuseur (diffuseur.datatourisme.fr) **n'accepte plus de nouveaux
> comptes ni de nouveaux flux**. Elle fermera en **octobre 2027**
> ([annonce](https://support.datatourisme.fr/t/3162)). Si vous n'avez pas déjà un
> flux, suivez l'**option A (API)**. L'option B ne sert que pour un flux Diffuseur
> qui existe déjà.

Le spider choisit tout seul : `DATATOURISME_FLUX_URL` s'il est défini, sinon
`DATATOURISME_API_KEY`, sinon il ne fait rien (une ligne dans les logs).

À quoi s'attendre : l'export Île-de-France du 8 octobre 2026 contient environ
**220 manifestations** dans le 75/92/93/94, dont environ **165 à venir**. Une fois
retirés les marchés, le sport et les offres « toute l'année », il en reste de
l'ordre de **60 à 100**. Ce sont surtout de grandes expositions et des festivals,
dont beaucoup sont déjà couverts par d'autres sources. Le gain est modeste mais
fiable.

---

## Option A : clé API (recommandée)

1. Allez sur https://www.datatourisme.fr/utiliser-les-donnees/ et demandez une **clé
   API** (gratuite). Utilisez l'adresse du projet. La clé arrive par e-mail.
2. Testez la clé dans un terminal (remplacez `VOTRE_CLE`) :
   ```bash
   curl -s -H "X-API-Key: VOTRE_CLE" \
     "https://api.datatourisme.fr/v1/entertainmentAndEvent?page_size=1&lang=fr" | head -c 600
   ```
   Vous devez obtenir du JSON qui commence par `{"objects": [...`. Si vous voyez
   `Invalid API key`, la clé contient sans doute des guillemets ou des espaces en
   trop.
3. Ajoutez le secret GitHub. Ouvrez
   https://github.com/JohanAmselem/sortir-paris/settings/secrets/actions/new puis :
   - **Name** : `DATATOURISME_API_KEY`
   - **Secret** : la clé seule, sans guillemets
   - cliquez sur **Add secret**.
4. Vérifiez que le workflow `.github/workflows/daily-scrape.yml` transmet bien
   `DATATOURISME_API_KEY` au job `official` (bloc `env:`), comme pour
   `OPENAGENDA_API_KEY`.

Le spider interroge `GET /v1/entertainmentAndEvent` avec le filtre
`isLocatedAt.address.hasAddressCity.isPartOfDepartment.insee[in]=75,92,93,94 AND takesPlaceAt.endDate[gte]=<aujourd'hui>`
et des pages de 100 objets, en suivant `meta.next`. Cela représente quelques
requêtes par passage, très en dessous du quota de 1 000 requêtes par heure.

---

## Option B : un flux Diffuseur existant (jusqu'en octobre 2027)

Cette option ne vaut que si le compte possède **déjà** un flux. La création de flux
est fermée depuis le 1er octobre 2026. Les intitulés ci-dessous peuvent légèrement
varier selon l'interface.

1. Connectez-vous sur https://diffuseur.datatourisme.fr.
2. **Flux**. Ouvrez le flux à utiliser, ou créez-en un si l'interface le permet
   encore. Puis définissez la requête :
   - **Type de POI** : « Fête et manifestation » (`EntertainmentAndEvent`).
     Gardez tous les sous-types : le spider écarte lui-même marchés, brocantes,
     salons, sport, événements professionnels et religieux.
   - **Territoire** : région « Île-de-France », ou mieux les départements
     **Paris (75)**, **Hauts-de-Seine (92)**, **Seine-Saint-Denis (93)** et
     **Val-de-Marne (94)**.
   - Facultatif : un filtre sur la date de fin, si l'interface le propose, pour
     exclure les manifestations terminées. Le spider les écarte de toute façon.
3. **Format** : choisissez **JSON-LD** (un fichier par objet). Le spider sait aussi
   lire le format JSON simplifié, mais c'est sur JSON-LD qu'il a été testé.
4. Enregistrez puis attendez la première génération du flux, qui peut prendre
   plusieurs heures.
5. **Applications**. Créez une application, par exemple « Paname Club », puis
   associez-la au flux. La page du flux affiche alors l'**URL du webservice** de
   téléchargement :
   `https://diffuseur.datatourisme.fr/webservice/<clé_du_flux>/<clé_application>`.
6. Testez l'URL : `curl -sI "<URL>"` doit répondre `200` avec un contenu ZIP. Le ZIP
   contient `index.json` et un dossier `objects/`.
7. Ajoutez le secret GitHub. Ouvrez
   https://github.com/JohanAmselem/sortir-paris/settings/secrets/actions/new puis :
   - **Name** : `DATATOURISME_FLUX_URL`
   - **Secret** : l'URL complète du webservice, clés comprises
   - cliquez sur **Add secret**.
   L'URL contient des clés : ne la collez jamais dans un ticket ni dans le code. Le
   spider masque les clés dans ses logs.
8. Transmettez `DATATOURISME_FLUX_URL` au job `official` dans
   `.github/workflows/daily-scrape.yml` (bloc `env:`).
9. Avant octobre 2027, passez à l'option A : il suffit de supprimer le secret
   `DATATOURISME_FLUX_URL` et d'ajouter `DATATOURISME_API_KEY`.

---

## Activer la source

Ajoutez cette ligne dans `scrapers/sources.py`, groupe « official » :

```python
SourceSpec("datatourisme", "official", "spiders.datatourisme", budget=10 * 60,
           env=[], notes="DATAtourisme (Licence Ouverte): needs DATATOURISME_API_KEY or DATATOURISME_FLUX_URL"),
```

Puis testez en local sans toucher à la base :

```bash
cd scrapers
DATATOURISME_API_KEY=... .venv/bin/python cron.py --source datatourisme --dry-run
```

## Obligations de la Licence Ouverte

Mentionnez la source, par exemple « Données DATAtourisme, Licence Ouverte 2.0 » sur
la page à propos ou les mentions légales, et ne déformez pas les données.
L'identifiant DATAtourisme (URI) est conservé dans `source_id` et dans `source_url`.
