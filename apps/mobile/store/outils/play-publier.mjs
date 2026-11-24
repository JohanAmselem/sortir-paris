// Publie une version Android de Paname Club sur Google Play par l'API (compte de service paname-club-publication).
// Clé : ~/.config/panameclub/play-publication.json (sur le Mac de Johan, jamais dans le dépôt).
// Usage : node apps/mobile/store/outils/play-publier.mjs <lire|publier>  (adapter AAB, captures, notes et description avant « publier »)
import { createSign } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const HOME = process.env.HOME
const KEY = JSON.parse(readFileSync(join(HOME, '.config/panameclub/play-publication.json'), 'utf8'))
const PKG = 'fr.panameclub.app'
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PKG}`
const AAB = join(HOME, 'Downloads/PanameClub-android-2.0.0-4.aab')
const SHOTS = join(HOME, 'Claude/sortir-paris-refonte/apps/mobile/store/captures/android-v2')
const LANG = 'fr-FR'
const NOTES = 'Nouvelle Paname Club : un nouveau look sombre, plus simple. Un Agenda pour trouver les sorties des mois à venir (jusqu’en 2028), une recherche qui comprend les dates, des photos en grand, et Mes sorties rangées comme des billets.'
const DESCRIPTION = `Que faire à Paris ce soir ? Et le mois prochain ? Paname Club te montre tout, simplement.

SORTIR
Ce soir, demain, ce week-end ou près de toi : notre choix en grandes photos, chacun avec sa raison (gratuit, moins de 15 €, dernier jour…), puis les envies, le week-end, les grosses dates à venir et les expos du moment.

AGENDA : JUSQU’EN 2028
Une seule recherche qui comprend « jazz samedi », « Angèle en mars » ou « concert 14 février ». Les mois défilent avec leur nombre de sorties, un jour se choisit d’un geste, et la liste est rangée par jour, année comprise.

TOUT PARIS, CHAQUE JOUR À JOUR
Plus de 20 000 sorties : concerts, expositions, théâtre, humour, danse, cinéma, festivals, ateliers, visites, soirées. Des grandes scènes (Accor Arena, Zénith, Olympia, Philharmonie…) aux petites salles.

LA CARTE ET « AUTOUR DE MOI »
Ce qui se passe près de toi, ce soir, ce week-end ou ce mois-ci, lieu par lieu.

ALERTES CONCERTS
Suis tes artistes : une notification quand ils annoncent une date à Paris, quand la billetterie ouvre, et la veille du concert.

MES SORTIES, PARTOUT
Garde une sortie, dis « J’y vais », ajoute-la à ton calendrier, trouve l’itinéraire, partage-la. Tes sorties restent disponibles sans réseau.

Les réservations se font sur les billetteries et les sites des lieux. Les horaires et les prix sont à vérifier auprès de l’organisateur.`

const b64u = (b) => Buffer.from(b).toString('base64url')
async function token() {
  const now = Math.floor(Date.now() / 1000)
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KEY.private_key_id }))
  const body = b64u(JSON.stringify({ iss: KEY.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: KEY.token_uri, iat: now, exp: now + 3600 }))
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(KEY.private_key)
  const res = await fetch(KEY.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${b64u(sig)}` }),
  })
  const j = await res.json()
  if (!j.access_token) throw new Error('jeton refusé : ' + JSON.stringify(j))
  return j.access_token
}

let TOKEN
async function call(method, url, body, contentType = 'application/json') {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': contentType } : {}) },
    body: body == null ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${url.replace(API, '').replace(UPLOAD, '[upload]')} → ${res.status} ${text.slice(0, 600)}`)
  return text ? JSON.parse(text) : null
}

async function lire() {
  TOKEN = await token()
  const edit = await call('POST', `${API}/edits`, {})
  try {
    const tracks = await call('GET', `${API}/edits/${edit.id}/tracks`)
    for (const t of tracks.tracks || []) console.log('canal', t.track, JSON.stringify((t.releases || []).map((r) => ({ nom: r.name, codes: r.versionCodes, etat: r.status }))))
    const l = await call('GET', `${API}/edits/${edit.id}/listings/${LANG}`)
    console.log('fiche', l.language, l.title, '|', l.shortDescription, '|', l.fullDescription.slice(0, 60))
    const imgs = await call('GET', `${API}/edits/${edit.id}/listings/${LANG}/phoneScreenshots`)
    console.log('captures téléphone', (imgs.images || []).length)
    const details = await call('GET', `${API}/edits/${edit.id}/details`)
    console.log('langue par défaut', details.defaultLanguage)
  } finally {
    await call('DELETE', `${API}/edits/${edit.id}`)
  }
}

async function publier() {
  TOKEN = await token()
  const edit = await call('POST', `${API}/edits`, {})
  const E = `${API}/edits/${edit.id}`
  const U = `${UPLOAD}/edits/${edit.id}`
  console.log('édition', edit.id)
  // 1. Le fichier Android
  const bundle = await call('POST', `${U}/bundles?uploadType=media`, readFileSync(AAB), 'application/octet-stream')
  console.log('bundle envoyé : versionCode', bundle.versionCode)
  // 2. La fiche (description 2.0, titre et accroche inchangés)
  const l = await call('GET', `${E}/listings/${LANG}`)
  await call('PUT', `${E}/listings/${LANG}`, { language: LANG, title: l.title, shortDescription: l.shortDescription, fullDescription: DESCRIPTION, video: l.video || '' })
  console.log('fiche mise à jour')
  // 3. Les captures téléphone
  await call('DELETE', `${E}/listings/${LANG}/phoneScreenshots`)
  for (const f of readdirSync(SHOTS).filter((x) => x.endsWith('.jpg')).sort()) {
    await call('POST', `${U}/listings/${LANG}/phoneScreenshots?uploadType=media`, readFileSync(join(SHOTS, f)), 'image/jpeg')
    console.log('capture', f)
  }
  // 4. La version de production
  await call('PUT', `${E}/tracks/production`, {
    track: 'production',
    releases: [{ name: `${bundle.versionCode} (2.0.0)`, versionCodes: [String(bundle.versionCode)], status: 'completed', releaseNotes: [{ language: LANG, text: NOTES }] }],
  })
  console.log('version de production prête')
  await call('POST', `${E}:validate`)
  console.log('validation OK')
  const done = await call('POST', `${E}:commit`)
  console.log('envoyé en examen, édition', done.id)
}

await ({ lire, publier })[process.argv[2]]()
