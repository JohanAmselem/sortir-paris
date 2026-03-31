import Anthropic from '@anthropic-ai/sdk'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, lte, desc, ilike, or, inArray } from 'drizzle-orm'

const VALID_CATEGORIES = [
  'concert', 'expo', 'theatre', 'cinema', 'festival',
  'conference', 'danse', 'spectacle', 'atelier', 'visite', 'sport',
] as const

// Map plural/variant slugs to DB slugs
const CATEGORY_ALIASES: Record<string, string> = {
  concerts: 'concert', expos: 'expo', expositions: 'expo',
  theatres: 'theatre', cinemas: 'cinema', festivals: 'festival',
  conferences: 'conference', danses: 'danse', spectacles: 'spectacle',
  ateliers: 'atelier', visites: 'visite', sports: 'sport',
}

export interface AIFilters {
  category: string | null
  dateFilter: 'today' | 'weekend' | 'week' | null
  specificDate: string | null
  isFree: boolean | null
  arrondissements: string[] // MULTIPLE arrondissements now
  keywords: string[]
}

export interface AISearchResult {
  filters: AIFilters
  events: Array<{
    event: typeof events.$inferSelect
    venue: typeof venues.$inferSelect | null
    category: typeof categories.$inferSelect | null
  }>
}

const SYSTEM_PROMPT = `Tu es un assistant spécialisé dans l'extraction de filtres de recherche pour une plateforme d'événements culturels à Paris.

Extrais les filtres suivants au format JSON :

- "category": une seule valeur parmi [${VALID_CATEGORIES.map((c) => `"${c}"`).join(', ')}] ou null. Pour le stand-up/humour/one-man-show, utilise "spectacle". Pour les concerts/musique, utilise "concert".
- "dateFilter": "today" si ce soir/aujourd'hui, "weekend" si week-end/samedi/dimanche, "week" si cette semaine, ou null
- "specificDate": date ISO (YYYY-MM-DD) si mentionnée, sinon null
- "isFree": true si gratuit, null sinon
- "arrondissements": TABLEAU de numéros d'arrondissement mentionnés, au format ["3e", "4e"]. Si l'utilisateur dit "3ème ou 4ème", retourne ["3e", "4e"]. Si un seul, retourne ["5e"]. Si aucun, retourne [].
- "keywords": mots-clés SPÉCIFIQUES décrivant le type précis (ex: ["stand-up"], ["jazz"], ["photo"]). EXCLURE: les noms de catégories déjà capturés (concert, spectacle, expo...), les mots génériques (sortie, événement, soir, paris, arrondissement), et les numéros d'arrondissement.

IMPORTANT: si l'utilisateur cherche du "stand up" ou "stand-up", la catégorie doit être "spectacle" ET le keyword doit être ["stand-up"].

Date d'aujourd'hui : DATE_TODAY

Réponds UNIQUEMENT avec le JSON.`

function parseQueryFallback(query: string): AIFilters {
  const q = query.toLowerCase()

  let category: string | null = null
  if (q.includes('stand-up') || q.includes('stand up') || q.includes('humour') || q.includes('one man') || q.includes('sketch') || q.includes('comédie') || q.includes('comique')) category = 'spectacle'
  else if (q.includes('jazz') || q.includes('musique') || q.includes('rock') || q.includes('rap') || q.includes('concert')) category = 'concert'
  else if (q.includes('photo') || q.includes('exposition') || q.includes('galerie') || q.includes('expo')) category = 'expo'
  else if (q.includes('pièce') || q.includes('théâtre') || q.includes('theatre')) category = 'theatre'
  else if (q.includes('sport') || q.includes('yoga') || q.includes('fitness')) category = 'sport'
  else {
    for (const cat of VALID_CATEGORIES) {
      if (q.includes(cat)) { category = cat; break }
    }
  }

  let dateFilter: 'today' | 'weekend' | 'week' | null = null
  if (q.includes('ce soir') || q.includes("aujourd'hui") || q.includes('aujourd')) dateFilter = 'today'
  else if (q.includes('week-end') || q.includes('weekend') || q.includes('samedi') || q.includes('dimanche')) dateFilter = 'weekend'
  else if (q.includes('semaine') || q.includes('prochains jours')) dateFilter = 'week'

  const isFree = q.includes('gratuit') || q.includes('free') ? true : null

  // Extract ALL arrondissements mentioned
  const arrondissements: string[] = []
  const arrRegex = /(\d{1,2})(?:e|er|ème|eme|ème)\s*(?:arr(?:ondissement)?)?/gi
  let match
  while ((match = arrRegex.exec(q)) !== null) {
    const num = parseInt(match[1])
    if (num >= 1 && num <= 20) {
      const formatted = `${num}e`
      if (!arrondissements.includes(formatted)) {
        arrondissements.push(formatted)
      }
    }
  }

  // Keywords: filter out generic terms, categories, and arrondissement numbers
  const stopWords = new Set([
    'je', 'un', 'une', 'le', 'la', 'les', 'de', 'du', 'des', 'dans', 'pour',
    'ce', 'cette', 'mon', 'ma', 'mes', 'ou', 'et', 'cherche', 'recherche',
    'veux', 'voudrais', 'aimerais', 'voir', 'trouver', 'soir', 'près', 'chez',
    'moi', 'concert', 'spectacle', 'exposition', 'événement', 'evenement',
    'sortie', 'paris', 'arrondissement', 'arrdt', 'arr', 'expo', 'théâtre',
    'theatre', 'cinéma', 'cinema', 'festival', 'danse', 'atelier', 'visite',
    'gratuit', 'free', 'week-end', 'weekend', 'samedi', 'dimanche', 'semaine',
    'aujourd', 'sport',
  ])

  const keywords = query
    .replace(/['']/g, ' ')
    .replace(/\d{1,2}(?:e|er|ème|eme)/gi, '') // remove arrondissement numbers
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()))
    .map(w => w.toLowerCase())
    .slice(0, 5)

  // Merge "stand" + "up" into "stand-up"
  const merged: string[] = []
  for (let i = 0; i < keywords.length; i++) {
    if (keywords[i] === 'stand' && keywords[i + 1] === 'up') {
      merged.push('stand-up')
      i++ // skip "up"
    } else {
      merged.push(keywords[i])
    }
  }

  return { category, dateFilter, specificDate: null, isFree, arrondissements, keywords: merged }
}

export async function parseQueryWithAI(query: string): Promise<AIFilters> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[AI Search] No ANTHROPIC_API_KEY — using fallback parser')
    return parseQueryFallback(query)
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const today = new Date().toISOString().split('T')[0]
    const currentYear = new Date().getFullYear()
    const systemPrompt = SYSTEM_PROMPT.replace('DATE_TODAY', today).replace('CURRENT_YEAR', String(currentYear))

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
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
    } else if (parsed.arrondissement) {
      // Backwards compat: single arrondissement string
      const num = parseInt(parsed.arrondissement)
      if (num >= 1 && num <= 20) arrs = [`${num}e`]
    }

    return {
      category: cat || null,
      dateFilter: parsed.dateFilter && ['today', 'weekend', 'week'].includes(parsed.dateFilter) ? parsed.dateFilter : null,
      specificDate: parsed.specificDate || null,
      isFree: typeof parsed.isFree === 'boolean' ? parsed.isFree : null,
      arrondissements: arrs,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.filter((k: string) => k.length > 1) : [],
    }
  } catch (error) {
    console.error('[AI Search] API error, using fallback:', error)
    return parseQueryFallback(query)
  }
}

function buildDateConditions(filters: AIFilters) {
  const now = new Date()
  const conds = []

  if (filters.specificDate) {
    const target = new Date(filters.specificDate)
    target.setHours(0, 0, 0, 0)
    const endOfDay = new Date(filters.specificDate)
    endOfDay.setHours(23, 59, 59, 999)
    conds.push(lte(events.startDate, endOfDay))
    conds.push(or(gte(events.endDate, target), gte(events.startDate, target))!)
  } else if (filters.dateFilter === 'today') {
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)
    conds.push(gte(events.startDate, now))
    conds.push(lte(events.startDate, endOfDay))
  } else if (filters.dateFilter === 'weekend') {
    const day = now.getDay()
    const sat = new Date(now)
    sat.setDate(now.getDate() + ((6 - day + 7) % 7 || 7))
    sat.setHours(0, 0, 0, 0)
    if (day === 6) sat.setDate(now.getDate())
    else if (day === 0) sat.setDate(now.getDate() - 1)
    const sun = new Date(sat)
    sun.setDate(sat.getDate() + 1)
    sun.setHours(23, 59, 59, 999)
    conds.push(gte(events.startDate, sat))
    conds.push(lte(events.startDate, sun))
  } else if (filters.dateFilter === 'week') {
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
      ilike(venues.name, kw),
      ilike(events.sourceUrl, kw),
    )
  }).filter(Boolean)
}

export async function searchWithFilters(filters: AIFilters): Promise<AISearchResult['events']> {
  // ========================================
  // Build base conditions (always applied)
  // ========================================
  const baseConds = [eq(events.status, 'active')]
  baseConds.push(...buildDateConditions(filters))

  if (filters.isFree === true) baseConds.push(eq(events.isFree, true))

  // Category — ALWAYS keep if specified (never relax this)
  let categoryId: string | null = null
  if (filters.category) {
    // Try exact slug match, then with 's' suffix (concerts vs concert)
    const slugsToTry = [filters.category, filters.category + 's', CATEGORY_ALIASES[filters.category] || '']
    for (const slug of slugsToTry) {
      if (!slug) continue
      const cat = await db.query.categories?.findFirst({
        where: eq(categories.slug, slug),
      })
      if (cat) {
        categoryId = cat.id
        baseConds.push(eq(events.categoryId, cat.id))
        break
      }
    }
  }

  // Arrondissements — OR between multiple
  if (filters.arrondissements.length === 1) {
    baseConds.push(eq(venues.arrondissement, filters.arrondissements[0]))
  } else if (filters.arrondissements.length > 1) {
    baseConds.push(
      or(...filters.arrondissements.map(a => eq(venues.arrondissement, a)))!
    )
  }

  // ========================================
  // PASS 1: All filters + ALL keywords must match
  // ========================================
  const kwConds = buildKeywordConditions(filters.keywords)
  const pass1 = [...baseConds, ...kwConds.map(c => c!)]

  let results = await db
    .select({ event: events, venue: venues, category: categories })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(and(...pass1))
    .orderBy(desc(events.qualityScore))
    .limit(48)

  if (results.length >= 1) {
    console.log(`[AI Search] Pass 1 (strict): ${results.length} results`)
    return results
  }

  // ========================================
  // PASS 2: All filters + ANY keyword matches
  // ========================================
  if (kwConds.length > 1) {
    const pass2 = [...baseConds]
    pass2.push(or(...kwConds.map(c => c!))!)

    results = await db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(...pass2))
      .orderBy(desc(events.qualityScore))
      .limit(48)

    if (results.length >= 1) {
      console.log(`[AI Search] Pass 2 (any keyword): ${results.length} results`)
      return results
    }
  }

  // ========================================
  // PASS 3: Drop keywords, keep category + date + arrondissement
  // ========================================
  if (kwConds.length > 0) {
    results = await db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(...baseConds))
      .orderBy(desc(events.qualityScore))
      .limit(48)

    if (results.length >= 1) {
      console.log(`[AI Search] Pass 3 (no keywords): ${results.length} results`)
      return results
    }
  }

  // ========================================
  // PASS 4: Drop arrondissement, keep category + date + keywords
  // ========================================
  if (filters.arrondissements.length > 0) {
    const noArrConds = [eq(events.status, 'active')]
    noArrConds.push(...buildDateConditions(filters))
    if (filters.isFree === true) noArrConds.push(eq(events.isFree, true))
    if (categoryId) noArrConds.push(eq(events.categoryId, categoryId))
    if (kwConds.length > 0) noArrConds.push(or(...kwConds.map(c => c!))!)

    results = await db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(...noArrConds))
      .orderBy(desc(events.qualityScore))
      .limit(48)

    if (results.length >= 1) {
      console.log(`[AI Search] Pass 4 (no arrondissement): ${results.length} results`)
      return results
    }
  }

  // ========================================
  // PASS 5: Drop date, keep category (NEVER drop category)
  // ========================================
  if (filters.dateFilter && categoryId) {
    const noDateConds = [eq(events.status, 'active'), gte(events.startDate, new Date())]
    noDateConds.push(eq(events.categoryId, categoryId))
    if (kwConds.length > 0) noDateConds.push(or(...kwConds.map(c => c!))!)

    results = await db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(...noDateConds))
      .orderBy(desc(events.qualityScore))
      .limit(48)

    console.log(`[AI Search] Pass 5 (category only, no date): ${results.length} results`)
    return results
  }

  // ========================================
  // Nothing found — return empty (DON'T show random events)
  // ========================================
  console.log(`[AI Search] No results found for any pass`)
  return []
}

export async function aiSearch(query: string): Promise<AISearchResult> {
  const filters = await parseQueryWithAI(query)
  console.log(`[AI Search] Filters:`, JSON.stringify(filters))
  const eventsList = await searchWithFilters(filters)
  return { filters, events: eventsList }
}
