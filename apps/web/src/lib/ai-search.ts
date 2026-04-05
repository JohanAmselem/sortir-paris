/**
 * Smart Search Engine for Sortir Paris
 *
 * Architecture:
 * 1. Claude parses natural language query → structured intent + expanded keywords
 * 2. Multi-pass search: Meilisearch (fast, typo-tolerant) + DB (precise, with keywords column)
 * 3. Progressive relaxation: never return empty results
 * 4. Relevance explanations: tell users WHY each result matches
 */

import Anthropic from '@anthropic-ai/sdk'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, lte, desc, ilike, or, sql, inArray } from 'drizzle-orm'
import { meiliAdmin, isMeilisearchEnabled, EVENTS_INDEX } from './meilisearch'

// ─── Types ───

// DB category slugs — mix of singular and plural, must match exactly
const VALID_CATEGORIES = [
  'concerts', 'expos', 'theatre', 'cinema', 'festivals',
  'conferences', 'danse', 'spectacles', 'ateliers', 'visites',
] as const

const CATEGORY_ALIASES: Record<string, string> = {
  // Singular → DB slug
  concert: 'concerts', expo: 'expos', festival: 'festivals',
  conference: 'conferences', spectacle: 'spectacles',
  atelier: 'ateliers', visite: 'visites',
  // Alternate forms → DB slug
  exposition: 'expos', expositions: 'expos',
  theatres: 'theatre', cinemas: 'cinema', danses: 'danse',
  musique: 'concerts', live: 'concerts', 'stand-up': 'spectacles',
  humour: 'spectacles', comedie: 'spectacles', 'comédie': 'spectacles',
  photo: 'expos', photographie: 'expos', peinture: 'expos',
  sculpture: 'expos', 'street-art': 'expos', ballet: 'danse',
  'comédie musicale': 'spectacles', opéra: 'concerts', opera: 'concerts',
  cirque: 'spectacles', magie: 'spectacles',
  sport: 'spectacles', sports: 'spectacles',
}

export interface AIIntent {
  // Structured filters
  category: string | null
  dateFilter: 'today' | 'weekend' | 'week' | null
  specificDate: string | null
  isFree: boolean | null
  arrondissements: string[]

  // Semantic understanding
  keywords: string[]              // specific search terms
  expandedKeywords: string[]      // synonyms + related terms for broader matching
  ambiance: string | null         // romantique, festif, chill, familial, underground...
  audience: string | null         // couple, famille, solo, amis, enfants...
  timeOfDay: string | null        // matin, après-midi, soirée, nocturne...

  // Intent metadata
  intentSummary: string           // one-line reformulation of what user wants
  isVague: boolean                // true if query is very vague ("sortie sympa")
  alternativeInterpretations: string[] // if ambiguous, other possible meanings
  suggestedQueries: string[]      // follow-up suggestions
}

export interface SearchResult {
  event: typeof events.$inferSelect
  venue: typeof venues.$inferSelect | null
  category: typeof categories.$inferSelect | null
  relevanceReason?: string        // why this result matches
  relevanceScore?: number         // 0-100 computed relevance
}

export interface AISearchResponse {
  intent: AIIntent
  events: SearchResult[]
  totalFound: number
  searchStrategy: string          // which pass found the results
  alternatives: SearchResult[]    // alternative suggestions if main results are few
}

// ─── AI Query Parser ───

const SYSTEM_PROMPT = `Tu es le cerveau du moteur de recherche de Sortir Paris, une plateforme d'événements culturels à Paris + petite couronne.

Ton rôle : comprendre l'INTENTION RÉELLE derrière chaque requête, même vague, imprécise ou incomplète.

RÈGLES D'ANALYSE :
1. "sortie sympa" → lieu populaire, bien noté, ambiance conviviale
2. "un truc à faire" → événements populaires et variés, prochains jours
3. "date night" / "en amoureux" → ambiance romantique, soirée, lieu intimiste
4. "avec les enfants" / "en famille" → jeune public, familial, ludique
5. "pas cher" / "budget" → gratuit ou prix bas, bons plans
6. "original" / "insolite" → ateliers, expériences immersives, événements atypiques
7. "dernière minute" / "là maintenant" → ce soir, aujourd'hui, immédiat
8. "chill" / "tranquille" → expo, balade, visite, pas de foule
9. Si un artiste/lieu spécifique est mentionné → keywords avec le nom exact
10. Si c'est très vague → isVague: true + plusieurs interprétations

CATÉGORIES VALIDES : ${VALID_CATEGORIES.join(', ')}
Note: stand-up/humour/one-man-show → "spectacles". Musique/live → "concerts". Photo/peinture → "expos". Les slugs sont tels quels dans la base (certains au pluriel, certains au singulier).

AMBIANCES : romantique, festif, chill, familial, underground, chic, culturel, sportif, pleinair, immersif

DATE D'AUJOURD'HUI : DATE_TODAY (JOUR_SEMAINE)

Réponds en JSON strict :
{
  "category": "string ou null",
  "dateFilter": "today|weekend|week ou null",
  "specificDate": "YYYY-MM-DD ou null",
  "isFree": "boolean ou null",
  "arrondissements": ["3e", "4e"],
  "keywords": ["terme1", "terme2"],
  "expandedKeywords": ["synonyme1", "synonyme2", "terme_associé"],
  "ambiance": "string ou null",
  "audience": "couple|famille|solo|amis|enfants ou null",
  "timeOfDay": "matin|après-midi|soirée|nocturne ou null",
  "intentSummary": "L'utilisateur cherche...",
  "isVague": false,
  "alternativeInterpretations": ["interprétation2", "interprétation3"],
  "suggestedQueries": ["requête suggérée 1", "requête suggérée 2"]
}

EXEMPLES :

"jazz ce soir marais" →
{"category":"concert","dateFilter":"today","keywords":["jazz"],"expandedKeywords":["jazz manouche","swing","bebop","blues","live jazz"],"arrondissements":["3e","4e"],"ambiance":"chill","audience":null,"timeOfDay":"soirée","intentSummary":"Concert de jazz ce soir dans le Marais","isVague":false,"alternativeInterpretations":[],"suggestedQueries":["jazz manouche ce soir","concerts Sunset Sunside","live music Marais"]}

"un truc sympa à faire samedi" →
{"category":null,"dateFilter":"weekend","keywords":[],"expandedKeywords":["populaire","tendance","original","convivial"],"arrondissements":[],"ambiance":"festif","audience":"amis","timeOfDay":null,"intentSummary":"L'utilisateur cherche une sortie agréable et populaire ce samedi, sans préférence de type","isVague":true,"alternativeInterpretations":["expo populaire","concert ambiance","balade culturelle","atelier créatif"],"suggestedQueries":["expos populaires ce weekend","concerts ce samedi","ateliers créatifs samedi"]}

"monet" →
{"category":"expo","dateFilter":null,"keywords":["monet","impressionnisme"],"expandedKeywords":["claude monet","impressionniste","nymphéas","peinture","musée"],"arrondissements":[],"ambiance":null,"audience":null,"timeOfDay":null,"intentSummary":"L'utilisateur cherche une exposition en lien avec Monet ou l'impressionnisme","isVague":false,"alternativeInterpretations":["exposition Monet spécifique","toute expo impressionniste"],"suggestedQueries":["expositions impressionnistes Paris","musée de l'Orangerie","musée Marmottan"]}

Réponds UNIQUEMENT avec le JSON, rien d'autre.`

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

function parseQueryFallback(query: string): AIIntent {
  const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // Category detection
  let category: string | null = null
  const categoryMap: [RegExp, string][] = [
    [/stand[- ]?up|humour|one[- ]man|sketch|comedie|comique/, 'spectacles'],
    [/jazz|musique|rock|rap|electro|techno|concert|live|dj/, 'concerts'],
    [/photo|exposition|galerie|expo|peinture|sculpture|art|vernissage/, 'expos'],
    [/piece|theatre|mise en scene/, 'theatre'],
    [/film|cinema|projection|seance/, 'cinema'],
    [/festival|fest\b/, 'festivals'],
    [/danse|ballet|choregraphie/, 'danse'],
    [/sport|yoga|fitness|running|course/, 'spectacles'],
    [/atelier|workshop|stage|cours|creatif/, 'ateliers'],
    [/visite|balade|patrimoine|parcours|architecture/, 'visites'],
    [/conference|debat|rencontre|table ronde|masterclass/, 'conferences'],
  ]
  for (const [re, cat] of categoryMap) {
    if (re.test(q)) { category = cat; break }
  }

  // Date
  let dateFilter: 'today' | 'weekend' | 'week' | null = null
  if (/ce soir|aujourd|maintenant|la tout de suite|right now/.test(q)) dateFilter = 'today'
  else if (/week[- ]?end|samedi|dimanche/.test(q)) dateFilter = 'weekend'
  else if (/semaine|prochains jours/.test(q)) dateFilter = 'week'

  const isFree = /gratuit|free|entree libre|pas cher|budget/.test(q) ? true : null

  // Arrondissements
  const arrondissements: string[] = []
  const arrRegex = /(\d{1,2})(?:e|er|eme|ème)\s*(?:arr)?/gi
  let match
  while ((match = arrRegex.exec(q)) !== null) {
    const num = parseInt(match[1])
    if (num >= 1 && num <= 20) {
      const formatted = `${num}e`
      if (!arrondissements.includes(formatted)) arrondissements.push(formatted)
    }
  }

  // Quartier → arrondissements
  const quartierMap: Record<string, string[]> = {
    marais: ['3e', '4e'], bastille: ['11e', '12e'], 'latin': ['5e', '6e'],
    'saint-germain': ['6e'], montmartre: ['18e'], belleville: ['20e', '19e'],
    oberkampf: ['11e'], 'republique': ['3e', '10e', '11e'],
    pigalle: ['9e', '18e'], batignolles: ['17e'], buttes: ['19e'],
    chatelet: ['1e'], opera: ['9e'], madeleine: ['8e'],
  }
  for (const [quartier, arrs] of Object.entries(quartierMap)) {
    if (q.includes(quartier)) {
      for (const a of arrs) {
        if (!arrondissements.includes(a)) arrondissements.push(a)
      }
    }
  }

  // Ambiance
  let ambiance: string | null = null
  if (/romantique|amoureux|couple|date|intime/.test(q)) ambiance = 'romantique'
  else if (/festif|fete|party|soiree|clubbing|dansant/.test(q)) ambiance = 'festif'
  else if (/chill|zen|tranquille|calme|detente|relax/.test(q)) ambiance = 'chill'
  else if (/famille|enfant|kid|jeune public|ludique/.test(q)) ambiance = 'familial'
  else if (/underground|alternatif|off|inde/.test(q)) ambiance = 'underground'
  else if (/original|insolite|atypique|unique|immersif/.test(q)) ambiance = 'immersif'

  // Audience
  let audience: string | null = null
  if (/couple|amoureux|date night|en duo/.test(q)) audience = 'couple'
  else if (/famille|enfant|kid/.test(q)) audience = 'famille'
  else if (/entre amis|potes|groupe/.test(q)) audience = 'amis'
  else if (/seul|solo/.test(q)) audience = 'solo'

  // Time of day
  let timeOfDay: string | null = null
  if (/matin|brunch|matinee/.test(q)) timeOfDay = 'matin'
  else if (/apres-midi|aprem/.test(q)) timeOfDay = 'après-midi'
  else if (/soir|soiree|nocturne|nuit/.test(q)) timeOfDay = 'soirée'

  // Extract meaningful keywords (filter out stop words and detected terms)
  const stopWords = new Set([
    'je', 'un', 'une', 'le', 'la', 'les', 'de', 'du', 'des', 'dans', 'pour',
    'ce', 'cette', 'mon', 'ma', 'mes', 'ou', 'et', 'cherche', 'recherche',
    'veux', 'voudrais', 'aimerais', 'voir', 'trouver', 'soir', 'pres', 'chez',
    'moi', 'concert', 'spectacle', 'exposition', 'evenement', 'sortie', 'paris',
    'arrondissement', 'arr', 'expo', 'theatre', 'cinema', 'festival', 'danse',
    'atelier', 'visite', 'gratuit', 'free', 'weekend', 'samedi', 'dimanche',
    'semaine', 'aujourd', 'sport', 'truc', 'sympa', 'quelque', 'chose', 'faire',
    'aller', 'quoi', 'bonne', 'bon', 'super', 'top', 'bien', 'trop', 'tres',
  ])

  const keywords = query
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, ' ')
    .replace(/\d{1,2}(?:e|er|eme)/gi, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()))
    .map(w => w.toLowerCase())
    .slice(0, 5)

  // Merge "stand" + "up"
  const merged: string[] = []
  for (let i = 0; i < keywords.length; i++) {
    if (keywords[i] === 'stand' && keywords[i + 1] === 'up') {
      merged.push('stand-up'); i++
    } else {
      merged.push(keywords[i])
    }
  }

  const isVague = !category && merged.length === 0 && !ambiance

  return {
    category, dateFilter, specificDate: null, isFree, arrondissements,
    keywords: merged, expandedKeywords: [],
    ambiance, audience, timeOfDay,
    intentSummary: isVague ? 'Recherche générale de sorties à Paris' : `Recherche: ${query}`,
    isVague,
    alternativeInterpretations: isVague ? ['Concerts populaires', 'Expos tendance', 'Spectacles du moment'] : [],
    suggestedQueries: [],
  }
}

export async function parseQueryWithAI(query: string): Promise<AIIntent> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[Smart Search] No ANTHROPIC_API_KEY — using fallback parser')
    return parseQueryFallback(query)
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const jourSemaine = JOURS[today.getDay()]
    const systemPrompt = SYSTEM_PROMPT
      .replace('DATE_TODAY', todayStr)
      .replace('JOUR_SEMAINE', jourSemaine)

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: query }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return parseQueryFallback(query)

    const parsed = JSON.parse(jsonMatch[0])

    // Normalize category
    let cat = parsed.category
    if (cat && CATEGORY_ALIASES[cat]) cat = CATEGORY_ALIASES[cat]
    if (cat && !VALID_CATEGORIES.includes(cat as typeof VALID_CATEGORIES[number])) cat = null

    // Normalize arrondissements
    let arrs: string[] = []
    if (Array.isArray(parsed.arrondissements)) {
      arrs = parsed.arrondissements
        .map((a: string) => {
          const num = parseInt(a)
          return num >= 1 && num <= 20 ? `${num}e` : a.replace(/ème|eme|er/, 'e')
        })
        .filter((a: string) => /^\d{1,2}e$/.test(a))
    }

    return {
      category: cat || null,
      dateFilter: parsed.dateFilter && ['today', 'weekend', 'week'].includes(parsed.dateFilter) ? parsed.dateFilter : null,
      specificDate: parsed.specificDate || null,
      isFree: typeof parsed.isFree === 'boolean' ? parsed.isFree : null,
      arrondissements: arrs,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.filter((k: string) => k.length > 1) : [],
      expandedKeywords: Array.isArray(parsed.expandedKeywords) ? parsed.expandedKeywords.filter((k: string) => k.length > 1) : [],
      ambiance: parsed.ambiance || null,
      audience: parsed.audience || null,
      timeOfDay: parsed.timeOfDay || null,
      intentSummary: parsed.intentSummary || query,
      isVague: !!parsed.isVague,
      alternativeInterpretations: Array.isArray(parsed.alternativeInterpretations) ? parsed.alternativeInterpretations : [],
      suggestedQueries: Array.isArray(parsed.suggestedQueries) ? parsed.suggestedQueries : [],
    }
  } catch (error) {
    console.error('[Smart Search] AI parse error, using fallback:', error)
    return parseQueryFallback(query)
  }
}

// ─── Search Engine ───

function buildDateConditions(intent: AIIntent) {
  const now = new Date()
  const conds = []

  if (intent.specificDate) {
    const target = new Date(intent.specificDate + 'T00:00:00')
    const endOfDay = new Date(intent.specificDate + 'T23:59:59.999')
    conds.push(gte(events.startDate, target))
    conds.push(lte(events.startDate, endOfDay))
  } else if (intent.dateFilter === 'today') {
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)
    conds.push(gte(events.startDate, now))
    conds.push(lte(events.startDate, endOfDay))
  } else if (intent.dateFilter === 'weekend') {
    const day = now.getDay()
    const sat = new Date(now)
    if (day === 0) sat.setDate(now.getDate() - 1)
    else if (day === 6) { /* already saturday */ }
    else sat.setDate(now.getDate() + (6 - day))
    sat.setHours(0, 0, 0, 0)
    const sun = new Date(sat)
    sun.setDate(sat.getDate() + 1)
    sun.setHours(23, 59, 59, 999)
    conds.push(gte(events.startDate, sat))
    conds.push(lte(events.startDate, sun))
  } else if (intent.dateFilter === 'week') {
    const endOfWeek = new Date(now)
    endOfWeek.setDate(now.getDate() + 7)
    conds.push(gte(events.startDate, now))
    conds.push(lte(events.startDate, endOfWeek))
  } else {
    conds.push(gte(events.startDate, now))
  }

  return conds
}

function buildKeywordConditions(keywords: string[]) {
  return keywords.filter(k => k.length > 1).map((keyword) => {
    const kw = `%${keyword}%`
    return or(
      ilike(events.title, kw),
      ilike(events.description, kw),
      ilike(events.shortDesc, kw),
      ilike(events.keywords, kw),
      ilike(venues.name, kw),
    )
  }).filter(Boolean)
}

function computeRelevanceScore(event: typeof events.$inferSelect, venue: typeof venues.$inferSelect | null, intent: AIIntent): number {
  let score = 0

  // Quality baseline (0-30)
  score += Math.min(30, (event.qualityScore ?? 0) * 0.3)

  // Popularity boost (0-15)
  const popularity = (event.saveCount ?? 0) + (event.viewCount ?? 0) * 0.1
  score += Math.min(15, popularity * 0.5)

  // Keyword match in title (0-25)
  const titleLower = event.title.toLowerCase()
  const allKeywords = [...intent.keywords, ...intent.expandedKeywords]
  let titleMatches = 0
  for (const kw of allKeywords) {
    if (titleLower.includes(kw.toLowerCase())) titleMatches++
  }
  if (allKeywords.length > 0) {
    score += Math.min(25, (titleMatches / allKeywords.length) * 25)
  } else {
    score += 10 // no keywords = general query, give baseline
  }

  // Temporal proximity boost (0-15)
  const hoursUntil = (new Date(event.startDate).getTime() - Date.now()) / 3600000
  if (hoursUntil < 6) score += 15        // starting very soon
  else if (hoursUntil < 24) score += 12   // today
  else if (hoursUntil < 72) score += 8    // next 3 days
  else if (hoursUntil < 168) score += 4   // this week

  // Free bonus if user cares about price (0-5)
  if (intent.isFree && event.isFree) score += 5

  // Ambiance match via keywords column (0-10)
  if (intent.ambiance && event.keywords) {
    const kwLower = event.keywords.toLowerCase()
    if (kwLower.includes(intent.ambiance)) score += 10
    // Partial matches on related terms
    else {
      const ambianceTerms: Record<string, string[]> = {
        romantique: ['intime', 'duo', 'couple', 'tendre'],
        festif: ['fête', 'party', 'dansant', 'clubbing', 'nuit'],
        chill: ['calme', 'zen', 'détente', 'lounge'],
        familial: ['enfants', 'famille', 'ludique', 'tout public'],
        underground: ['alternatif', 'off', 'indé', 'friche'],
        immersif: ['immersion', 'interactif', 'expérience', 'participatif'],
      }
      const terms = ambianceTerms[intent.ambiance] || []
      for (const term of terms) {
        if (kwLower.includes(term)) { score += 5; break }
      }
    }
  }

  return Math.min(100, Math.round(score))
}

function generateRelevanceReason(event: typeof events.$inferSelect, venue: typeof venues.$inferSelect | null, category: typeof categories.$inferSelect | null, intent: AIIntent): string {
  const reasons: string[] = []

  // Keyword match
  const titleLower = event.title.toLowerCase()
  const matchedKw = intent.keywords.filter(kw => titleLower.includes(kw.toLowerCase()))
  if (matchedKw.length > 0) {
    reasons.push(`Correspond à "${matchedKw.join(', ')}"`)
  }

  // Category match
  if (intent.category && category?.slug === intent.category) {
    reasons.push(`Catégorie ${category.name}`)
  }

  // Location match
  if (intent.arrondissements.length > 0 && venue?.arrondissement) {
    if (intent.arrondissements.includes(venue.arrondissement)) {
      reasons.push(`${venue.arrondissement} arrondissement`)
    }
  }

  // Popularity
  if ((event.saveCount ?? 0) > 10) {
    reasons.push(`${event.saveCount} personnes intéressées`)
  }

  // Free
  if (event.isFree && intent.isFree) {
    reasons.push('Gratuit')
  }

  // Temporal
  const hoursUntil = (new Date(event.startDate).getTime() - Date.now()) / 3600000
  if (hoursUntil < 6 && hoursUntil > 0) reasons.push('Commence bientôt')
  else if (hoursUntil < 24 && hoursUntil > 0) reasons.push("Aujourd'hui")

  // Ambiance from keywords
  if (intent.ambiance && event.keywords?.toLowerCase().includes(intent.ambiance)) {
    reasons.push(`Ambiance ${intent.ambiance}`)
  }

  if (reasons.length === 0) {
    // Fallback reason
    if (category) reasons.push(category.name)
    if (venue) reasons.push(venue.name ?? '')
  }

  return reasons.slice(0, 3).join(' · ')
}

// ─── Multi-pass DB Search ───

async function searchDB(intent: AIIntent): Promise<{ results: SearchResult[]; strategy: string }> {
  const baseConds = [eq(events.status, 'active')]
  baseConds.push(...buildDateConditions(intent))

  if (intent.isFree === true) baseConds.push(eq(events.isFree, true))

  // Category
  let categoryId: string | null = null
  if (intent.category) {
    // intent.category should already be a valid DB slug, but try alias as fallback
    const slugsToTry = [intent.category, CATEGORY_ALIASES[intent.category] || ''].filter(Boolean)
    for (const slug of [...new Set(slugsToTry)]) {
      const cat = await db.query.categories?.findFirst({ where: eq(categories.slug, slug) })
      if (cat) { categoryId = cat.id; baseConds.push(eq(events.categoryId, cat.id)); break }
    }
  }

  // Arrondissements
  if (intent.arrondissements.length === 1) {
    baseConds.push(eq(venues.arrondissement, intent.arrondissements[0]))
  } else if (intent.arrondissements.length > 1) {
    baseConds.push(or(...intent.arrondissements.map(a => eq(venues.arrondissement, a)))!)
  }

  const allKeywords = [...intent.keywords, ...intent.expandedKeywords]
  const kwConds = buildKeywordConditions(intent.keywords) // strict keywords first
  const expandedKwConds = buildKeywordConditions(allKeywords)

  async function runQuery(conds: unknown[], limit = 48) {
    return db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(...conds as Parameters<typeof and>))
      .orderBy(desc(events.qualityScore))
      .limit(limit)
  }

  // PASS 1: All filters + ALL strict keywords
  if (kwConds.length > 0) {
    const results = await runQuery([...baseConds, ...kwConds.map(c => c!)])
    if (results.length >= 1) {
      return { results: results.map(r => ({ ...r })), strategy: 'exact' }
    }
  }

  // PASS 2: All filters + ANY keyword (strict + expanded)
  if (expandedKwConds.length > 0) {
    const results = await runQuery([...baseConds, or(...expandedKwConds.map(c => c!))!])
    if (results.length >= 1) {
      return { results: results.map(r => ({ ...r })), strategy: 'expanded_keywords' }
    }
  }

  // PASS 3: Drop keywords, keep category + date + arrondissement
  if (kwConds.length > 0 || expandedKwConds.length > 0) {
    const results = await runQuery(baseConds)
    if (results.length >= 1) {
      return { results: results.map(r => ({ ...r })), strategy: 'category_date_only' }
    }
  }

  // PASS 4: Drop arrondissement, keep category + date + keywords
  if (intent.arrondissements.length > 0) {
    const noArrConds = [eq(events.status, 'active')]
    noArrConds.push(...buildDateConditions(intent))
    if (intent.isFree === true) noArrConds.push(eq(events.isFree, true))
    if (categoryId) noArrConds.push(eq(events.categoryId, categoryId))
    if (expandedKwConds.length > 0) noArrConds.push(or(...expandedKwConds.map(c => c!))!)
    const results = await runQuery(noArrConds)
    if (results.length >= 1) {
      return { results: results.map(r => ({ ...r })), strategy: 'no_arrondissement' }
    }
  }

  // PASS 5: Drop date, keep category + keywords
  if (intent.dateFilter && (categoryId || expandedKwConds.length > 0)) {
    const noDateConds = [eq(events.status, 'active'), gte(events.startDate, new Date())]
    if (categoryId) noDateConds.push(eq(events.categoryId, categoryId))
    if (expandedKwConds.length > 0) noDateConds.push(or(...expandedKwConds.map(c => c!))!)
    const results = await runQuery(noDateConds)
    if (results.length >= 1) {
      return { results: results.map(r => ({ ...r })), strategy: 'no_date' }
    }
  }

  // PASS 6: Category only (future events)
  if (categoryId) {
    const catOnlyConds = [eq(events.status, 'active'), gte(events.startDate, new Date()), eq(events.categoryId, categoryId)]
    const results = await runQuery(catOnlyConds)
    if (results.length >= 1) {
      return { results: results.map(r => ({ ...r })), strategy: 'category_only' }
    }
  }

  // PASS 7: Ultimate fallback — popular upcoming events
  const fallback = await runQuery([
    eq(events.status, 'active'),
    gte(events.startDate, new Date()),
  ])
  return { results: fallback.map(r => ({ ...r })), strategy: 'popular_fallback' }
}

// ─── Meilisearch Search ───

async function searchMeilisearch(intent: AIIntent): Promise<SearchResult[]> {
  if (!isMeilisearchEnabled || !meiliAdmin) return []

  try {
    const searchQuery = [...intent.keywords, ...intent.expandedKeywords].join(' ')
    if (!searchQuery.trim()) return []

    const filters: string[] = []
    if (intent.category) filters.push(`categorySlug = "${intent.category}"`)
    if (intent.isFree === true) filters.push('isFree = true')
    if (intent.arrondissements.length === 1) {
      filters.push(`arrondissement = "${intent.arrondissements[0]}"`)
    } else if (intent.arrondissements.length > 1) {
      filters.push(`arrondissement IN [${intent.arrondissements.map(a => `"${a}"`).join(', ')}]`)
    }

    // Date filters
    if (intent.dateFilter === 'today') {
      const now = Math.floor(Date.now() / 1000)
      const endOfDay = new Date()
      endOfDay.setHours(23, 59, 59, 999)
      filters.push(`startDate >= ${now}`)
      filters.push(`startDate <= ${Math.floor(endOfDay.getTime() / 1000)}`)
    } else if (intent.dateFilter === 'weekend') {
      const now = new Date()
      const day = now.getDay()
      const sat = new Date(now)
      if (day === 0) sat.setDate(now.getDate() - 1)
      else if (day !== 6) sat.setDate(now.getDate() + (6 - day))
      sat.setHours(0, 0, 0, 0)
      const sun = new Date(sat)
      sun.setDate(sat.getDate() + 1)
      sun.setHours(23, 59, 59, 999)
      filters.push(`startDate >= ${Math.floor(sat.getTime() / 1000)}`)
      filters.push(`startDate <= ${Math.floor(sun.getTime() / 1000)}`)
    } else {
      filters.push(`startDate >= ${Math.floor(Date.now() / 1000)}`)
    }

    const index = meiliAdmin.index(EVENTS_INDEX)
    const meiliResults = await index.search(searchQuery, {
      filter: filters.length > 0 ? filters.join(' AND ') : undefined,
      limit: 50,
      attributesToRetrieve: ['id', 'slug'],
    })

    if (meiliResults.hits.length === 0) return []

    // Fetch full event data from DB for Meilisearch hits
    const hitIds = meiliResults.hits.map((h: Record<string, unknown>) => h.id as string)
    const fullEvents = await db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(inArray(events.id, hitIds))

    // Preserve Meilisearch ordering
    const eventMap = new Map(fullEvents.map(e => [e.event.id, e]))
    return hitIds
      .map(id => eventMap.get(id))
      .filter(Boolean)
      .map(r => ({ ...r! }))
  } catch (error) {
    console.error('[Smart Search] Meilisearch error:', error)
    return []
  }
}

// ─── Fetch alternatives (different category or broader) ───

async function fetchAlternatives(intent: AIIntent, mainResultIds: Set<string>): Promise<SearchResult[]> {
  const now = new Date()

  // If the main search was for a specific category, suggest popular events from other categories
  const conds = [
    eq(events.status, 'active'),
    gte(events.startDate, now),
  ]

  // If we searched a specific category, get alternatives from OTHER categories
  if (intent.category) {
    const slug = CATEGORY_ALIASES[intent.category] || intent.category
    const cat = await db.query.categories?.findFirst({ where: eq(categories.slug, slug) })
    if (cat) {
      conds.push(sql`${events.categoryId} != ${cat.id}`)
    }
  }

  const altResults = await db
    .select({ event: events, venue: venues, category: categories })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(and(...conds))
    .orderBy(desc(events.saveCount))
    .limit(8)

  return altResults
    .filter(r => !mainResultIds.has(r.event.id))
    .slice(0, 4)
    .map(r => ({ ...r }))
}

// ─── Main Search Entry Point ───

export async function aiSearch(query: string): Promise<AISearchResponse> {
  // 1. Parse query with AI
  const intent = await parseQueryWithAI(query)
  console.log(`[Smart Search] Intent:`, JSON.stringify(intent, null, 2))

  // 2. Run hybrid search: Meilisearch (fast, typo-tolerant) + DB (precise, multi-pass)
  const [meiliResults, dbSearch] = await Promise.all([
    searchMeilisearch(intent),
    searchDB(intent),
  ])

  // 3. Merge & deduplicate results (Meilisearch results first, then DB)
  const seen = new Set<string>()
  const merged: SearchResult[] = []

  // Meilisearch results are already relevance-ranked
  for (const r of meiliResults) {
    if (!seen.has(r.event.id)) {
      seen.add(r.event.id)
      merged.push(r)
    }
  }

  // DB results fill in gaps
  for (const r of dbSearch.results) {
    if (!seen.has(r.event.id)) {
      seen.add(r.event.id)
      merged.push(r)
    }
  }

  // 4. Score and sort all results by relevance
  const scored = merged.map(r => ({
    ...r,
    relevanceScore: computeRelevanceScore(r.event, r.venue, intent),
    relevanceReason: generateRelevanceReason(r.event, r.venue, r.category, intent),
  }))

  scored.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))

  // 5. Fetch alternatives if main results are few
  let alternatives: SearchResult[] = []
  if (scored.length < 5) {
    alternatives = await fetchAlternatives(intent, seen)
  }

  const strategy = meiliResults.length > 0
    ? `meilisearch+${dbSearch.strategy}`
    : dbSearch.strategy

  console.log(`[Smart Search] Found ${scored.length} results (strategy: ${strategy})`)

  return {
    intent,
    events: scored,
    totalFound: scored.length,
    searchStrategy: strategy,
    alternatives,
  }
}

// ─── Legacy exports for backwards compatibility ───
export type AIFilters = AIIntent
export type AISearchResult = {
  filters: AIIntent
  events: Array<{
    event: typeof events.$inferSelect
    venue: typeof venues.$inferSelect | null
    category: typeof categories.$inferSelect | null
  }>
}
