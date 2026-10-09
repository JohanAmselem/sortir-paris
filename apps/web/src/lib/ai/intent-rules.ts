/**
 * Deterministic French intent parser. Runs first, for free, on every request:
 * it handles most real queries ("ce soir dans le 11e", "gratuit ce week-end",
 * "concert jazz moins de 20 €") and is the fallback when the LLM is unavailable.
 */
import { foldText } from '@/lib/events/fold'
import { normalizeArrondissement } from '@/lib/events/taxonomy'

export interface OutingIntent {
  when: 'now' | 'tonight' | 'today' | 'tomorrow' | 'weekend' | 'week' | 'month' | null
  date: string | null // YYYY-MM-DD
  categories: string[]
  arrondissements: string[]
  maxPrice: number | null // euros
  free: boolean
  intents: string[]
  keywords: string[]
  nearMe: boolean
  people: number | null
  /** One short French sentence restating the request. */
  summary: string
}

export const EMPTY_INTENT: OutingIntent = {
  when: null,
  date: null,
  categories: [],
  arrondissements: [],
  maxPrice: null,
  free: false,
  intents: [],
  keywords: [],
  nearMe: false,
  people: null,
  summary: '',
}

const CATEGORY_WORDS: Array<[RegExp, string]> = [
  [/\b(concerts?|musique|live|jazz|rock|rap|electro|classique|opera|chanson|dj|groupe)\b/, 'concerts'],
  [/\b(expos?|expositions?|musees?|galeries?|peinture|photo(graphie)?s?|art contemporain|vernissage)\b/, 'expos'],
  [/\b(theatre|piece|comedie(?! musicale))\b/, 'theatre'],
  [/\b(spectacles?|humour|humoriste|stand[ -]?up|one man|cirque|magie|cabaret|comedie musicale|impro)\b/, 'spectacles'],
  [/\b(danse|ballet|choregraph\w*)\b/, 'danse'],
  [/\b(cine|cinema|films?|projections?|seances?|avant-premiere)\b/, 'cinema'],
  [/\b(festivals?)\b/, 'festivals'],
  [/\b(conferences?|rencontres?|debats?|lectures?|talks?)\b/, 'conferences'],
  [/\b(ateliers?|workshops?|cours|initiation)\b/, 'ateliers'],
  [/\b(visites?|balades?|promenades?|patrimoine)\b/, 'visites'],
]

const INTENT_WORDS: Array<[RegExp, string]> = [
  [/\b(amoureux|en couple|a deux|romanti\w*|date|rencard|ma copine|mon copain|ma femme|mon mari)\b/, 'en-amoureux'],
  [/\b(entre amis|avec des amis|avec mes potes|entre potes|en bande|a plusieurs|groupe d'amis)\b/, 'entre-amis'],
  [/\b(en famille|enfants?|kids|gamins?|bebes?|petits?|famille|ado)\b/, 'en-famille'],
  [/\b(insolite|original|originale|atypique|decale|surprenant|inhabituel|secret|bizarre)\b/, 'insolite'],
  [/\b(plein air|exterieur|dehors|en terrasse|jardins?|parcs?)\b/, 'plein-air'],
  [/\b(faire la fete|danser|soiree|clubbing|fete|boite)\b/, 'festif'],
  [/\b(calme|tranquille|chill|cosy|reposant|detente)\b/, 'chill'],
  [/\b(intello|pointu|curieux|apprendre|reflechir)\b/, 'culture-pointue'],
]

const WORD_NUMBERS: Record<string, number> = { deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6 }

export function parseIntentRules(raw: string): OutingIntent {
  const t = ` ${foldText(raw).replace(/[’']/g, "'")} `
  const intent: OutingIntent = { ...EMPTY_INTENT, categories: [], arrondissements: [], intents: [], keywords: [] }

  // When
  if (/\b(maintenant|tout de suite|la maintenant|dans l'heure)\b/.test(t)) intent.when = 'now'
  else if (/\b(ce soir|cette nuit|ce soir-la|tonight)\b/.test(t)) intent.when = 'tonight'
  else if (/\b(aujourd'hui|aujourdhui|cet aprem|cet apres-midi|ce midi)\b/.test(t)) intent.when = 'today'
  else if (/\b(demain)\b/.test(t)) intent.when = 'tomorrow'
  else if (/\b(ce week-?end|ce we|samedi|dimanche|vendredi soir)\b/.test(t)) intent.when = 'weekend'
  else if (/\b(cette semaine|dans la semaine|les prochains jours)\b/.test(t)) intent.when = 'week'
  else if (/\b(ce mois|ce mois-ci)\b/.test(t)) intent.when = 'month'

  // Arrondissements: "11e", "dans le 11", "75011", "11eme"
  const arrMatches = t.matchAll(/\b(?:dans le |le |du |(?=750))?(750\d{2}|\d{1,2})\s?(er|e|eme|ème)?\b(?!\s?(€|euros?|ans|h\b|heures?|personnes?|min))/g)
  for (const m of arrMatches) {
    const hasMarker = Boolean(m[2]) || m[1].startsWith('750') || /\b(dans|le|du) $/.test(t.slice(0, m.index ?? 0).slice(-5))
    if (!hasMarker) continue
    const arr = normalizeArrondissement(m[1])
    if (arr && !intent.arrondissements.includes(arr)) intent.arrondissements.push(arr)
  }

  // Budget
  if (/\b(gratuit\w*|gratos|sans payer|free|entree libre|pas cher du tout)\b/.test(t)) intent.free = true
  const budget = /(?:moins de|max(?:imum)?|pas plus de|jusqu'a|budget(?: de)?|<)\s*(\d{1,3})\s*(?:€|euros?|e\b)/.exec(t)
  if (budget) intent.maxPrice = Number(budget[1])
  else if (/\b(pas cher|petit budget|bon marche|abordable)\b/.test(t)) intent.maxPrice = 15

  // People
  const people = /\b(\d|deux|trois|quatre|cinq|six)\s+(personnes|amis|potes|places)\b/.exec(t)
  if (people) intent.people = WORD_NUMBERS[people[1]] ?? Number(people[1])
  else if (/\b(a deux|en couple|tous les deux)\b/.test(t)) intent.people = 2

  if (/\b(pres de moi|autour de moi|a cote|pas loin|proche|dans le coin|quartier)\b/.test(t)) intent.nearMe = true

  for (const [re, slug] of CATEGORY_WORDS) if (re.test(t) && !intent.categories.includes(slug)) intent.categories.push(slug)
  for (const [re, slug] of INTENT_WORDS) if (re.test(t) && !intent.intents.includes(slug)) intent.intents.push(slug)

  // Specific genre words kept as keywords (they narrow within a category).
  const genre = t.match(/\b(jazz|rock|rap|electro|classique|opera|blues|soul|funk|reggae|metal|techno|house|salsa|tango|photo|street art|impressionnis\w*|manga|bd|cirque|magie|impro|stand[ -]?up|piano|orgue)\b/g)
  if (genre) intent.keywords = [...new Set(genre.map((g) => g.trim()))].slice(0, 4)

  intent.summary = summarize(intent)
  return intent
}

const WHEN_LABEL: Record<NonNullable<OutingIntent['when']>, string> = {
  now: 'maintenant',
  tonight: 'ce soir',
  today: "aujourd'hui",
  tomorrow: 'demain',
  weekend: 'ce week-end',
  week: 'cette semaine',
  month: 'ce mois-ci',
}

export function summarize(i: OutingIntent): string {
  const parts: string[] = []
  if (i.keywords.length) parts.push(i.keywords.join(', '))
  else if (i.categories.length) parts.push(i.categories.join(' ou '))
  else parts.push('une sortie')
  if (i.when) parts.push(WHEN_LABEL[i.when])
  if (i.arrondissements.length) parts.push(`dans le ${i.arrondissements.join(', ')}`)
  if (i.nearMe) parts.push('près de toi')
  if (i.free) parts.push('gratuite')
  else if (i.maxPrice != null) parts.push(`à moins de ${i.maxPrice} €`)
  return parts.join(' ')
}

/** True when rules already understood something useful (skip the LLM). */
export function isWellUnderstood(raw: string, i: OutingIntent): boolean {
  const signals =
    Number(Boolean(i.when)) +
    Number(i.categories.length > 0 || i.keywords.length > 0) +
    Number(i.arrondissements.length > 0 || i.nearMe) +
    Number(i.free || i.maxPrice != null) +
    Number(i.intents.length > 0)
  const words = raw.trim().split(/\s+/).length
  return words <= 4 ? signals >= 1 : signals >= 3
}
