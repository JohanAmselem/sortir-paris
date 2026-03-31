import Anthropic from '@anthropic-ai/sdk'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, lte, desc, sql, ilike, or } from 'drizzle-orm'

const VALID_CATEGORIES = [
  'concert',
  'expo',
  'theatre',
  'cinema',
  'festival',
  'conference',
  'danse',
  'spectacle',
  'atelier',
  'visite',
  'sport',
] as const

export interface AIFilters {
  category: string | null
  dateFilter: 'today' | 'weekend' | 'week' | null
  specificDate: string | null // ISO date string
  isFree: boolean | null
  arrondissement: string | null
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

const SYSTEM_PROMPT = `Tu es un assistant spécialisé dans l'extraction de filtres de recherche à partir de requêtes en langage naturel pour une plateforme d'événements culturels à Paris.

À partir de la requête utilisateur, extrais les filtres suivants au format JSON :

- "category": une seule valeur parmi [${VALID_CATEGORIES.map((c) => `"${c}"`).join(', ')}] ou null si non mentionné
- "dateFilter": "today" si ce soir/aujourd'hui, "weekend" si ce week-end/samedi/dimanche, "week" si cette semaine/les prochains jours, ou null
- "specificDate": une date ISO (YYYY-MM-DD) si une date précise est mentionnée (ex: "le 28 avril" → "CURRENT_YEAR-04-28"), sinon null
- "isFree": true si gratuit/free est mentionné, false si payant est mentionné, null sinon
- "arrondissement": le numéro d'arrondissement au format "5e", "10e", "20e" etc., ou null
- "keywords": un tableau de mots-clés SPÉCIFIQUES et pertinents pour filtrer les résultats (ex: ["jazz"], ["photo", "noir et blanc"], ["humour"]). N'inclure QUE les mots qui décrivent le TYPE SPÉCIFIQUE d'événement recherché. Exclure les mots génériques (concert, spectacle, exposition, événement, sortie, soir, gratuit, paris, arrondissement).

La date d'aujourd'hui est : DATE_TODAY

Réponds UNIQUEMENT avec le JSON, sans commentaire ni explication.`

// Simple fallback parser when AI is unavailable
function parseQueryFallback(query: string): AIFilters {
  const q = query.toLowerCase()
  const stopWords = ['je', 'un', 'une', 'le', 'la', 'les', 'de', 'du', 'des', 'dans', 'pour', 'ce', 'cette', 'mon', 'ma', 'mes', 'cherche', 'recherche', 'veux', 'voudrais', 'aimerais', 'voir', 'trouver', 'soir', 'près', 'chez', 'moi', 'concert', 'spectacle', 'exposition', 'événement', 'evenement', 'sortie', 'paris']

  let category: string | null = null
  for (const cat of VALID_CATEGORIES) {
    if (q.includes(cat)) { category = cat; break }
  }
  if (q.includes('jazz') || q.includes('musique') || q.includes('rock') || q.includes('rap')) category = 'concert'
  if (q.includes('photo') || q.includes('exposition') || q.includes('galerie')) category = 'expo'
  if (q.includes('pièce') || q.includes('comédie') || q.includes('comique') || q.includes('humour')) category = 'theatre'

  let dateFilter: 'today' | 'weekend' | 'week' | null = null
  if (q.includes('ce soir') || q.includes("aujourd'hui") || q.includes('aujourd')) dateFilter = 'today'
  else if (q.includes('week-end') || q.includes('weekend') || q.includes('samedi') || q.includes('dimanche')) dateFilter = 'weekend'
  else if (q.includes('semaine') || q.includes('prochains jours')) dateFilter = 'week'

  const isFree = q.includes('gratuit') || q.includes('free') ? true : null

  const arrMatch = q.match(/(\d{1,2})(?:e|er|ème|eme)\s*(?:arr|arrondissement)?/)
  const arrondissement = arrMatch ? `${arrMatch[1]}e` : null

  // Only keep truly specific keywords (not generic words already captured as filters)
  const genericWords = [...stopWords, 'concert', 'expo', 'théâtre', 'theatre', 'cinéma', 'cinema', 'festival', 'danse', 'atelier', 'visite', 'gratuit', 'free', 'week-end', 'weekend', 'samedi', 'dimanche', 'semaine', 'aujourd', 'arrondissement', 'arrdt']
  const keywords = query
    .replace(/['']/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !genericWords.includes(w.toLowerCase()))
    .slice(0, 5)

  return { category, dateFilter, specificDate: null, isFree, arrondissement, keywords }
}

export async function parseQueryWithAI(query: string): Promise<AIFilters> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[AI Search] No ANTHROPIC_API_KEY — using fallback parser')
    return parseQueryFallback(query)
  }

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    const today = new Date().toISOString().split('T')[0]
    const currentYear = new Date().getFullYear()

    const systemPrompt = SYSTEM_PROMPT
      .replace('DATE_TODAY', today)
      .replace('CURRENT_YEAR', String(currentYear))

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: query,
        },
      ],
    })

    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : ''

    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return parseQueryFallback(query)
    }

    const parsed = JSON.parse(jsonMatch[0])

    return {
      category:
        parsed.category && VALID_CATEGORIES.includes(parsed.category)
          ? parsed.category
          : null,
      dateFilter:
        parsed.dateFilter &&
        ['today', 'weekend', 'week'].includes(parsed.dateFilter)
          ? parsed.dateFilter
          : null,
      specificDate: parsed.specificDate || null,
      isFree: typeof parsed.isFree === 'boolean' ? parsed.isFree : null,
      arrondissement: parsed.arrondissement || null,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    }
  } catch (error) {
    console.error('[AI Search] API error, using fallback:', error)
    return parseQueryFallback(query)
  }
}

/**
 * Build date conditions based on filters
 */
function buildDateConditions(filters: AIFilters) {
  const now = new Date()
  const dateConds = []

  if (filters.specificDate) {
    const targetDate = new Date(filters.specificDate)
    targetDate.setHours(0, 0, 0, 0)
    const endOfDay = new Date(filters.specificDate)
    endOfDay.setHours(23, 59, 59, 999)
    dateConds.push(lte(events.startDate, endOfDay))
    dateConds.push(
      or(gte(events.endDate, targetDate), gte(events.startDate, targetDate))!
    )
  } else if (filters.dateFilter === 'today') {
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)
    dateConds.push(gte(events.startDate, now))
    dateConds.push(lte(events.startDate, endOfDay))
  } else if (filters.dateFilter === 'weekend') {
    const dayOfWeek = now.getDay()
    const saturday = new Date(now)
    saturday.setDate(now.getDate() + ((6 - dayOfWeek + 7) % 7 || 7))
    saturday.setHours(0, 0, 0, 0)
    if (dayOfWeek === 6) saturday.setDate(now.getDate())
    else if (dayOfWeek === 0) saturday.setDate(now.getDate() - 1)
    const sunday = new Date(saturday)
    sunday.setDate(saturday.getDate() + 1)
    sunday.setHours(23, 59, 59, 999)
    dateConds.push(gte(events.startDate, saturday))
    dateConds.push(lte(events.startDate, sunday))
  } else if (filters.dateFilter === 'week') {
    const endOfWeek = new Date(now)
    endOfWeek.setDate(now.getDate() + 7)
    dateConds.push(gte(events.startDate, now))
    dateConds.push(lte(events.startDate, endOfWeek))
  } else {
    dateConds.push(gte(events.startDate, now))
  }

  return dateConds
}

/**
 * Build keyword matching condition — searches across title, description, venue name, and source
 */
function buildKeywordCondition(keywords: string[]) {
  if (keywords.length === 0) return null

  const allKeywordMatches = keywords.map((keyword) => {
    const kw = `%${keyword}%`
    return or(
      ilike(events.title, kw),
      ilike(events.description, kw),
      ilike(events.shortDesc, kw),
      ilike(venues.name, kw),
      // Also search in source URL (e.g. "jazz" might appear in parisjazzclub URLs)
      ilike(events.sourceUrl, kw),
    )
  })

  // ALL keywords must match somewhere (AND logic between keywords)
  return allKeywordMatches.filter(Boolean)
}

export async function searchWithFilters(
  filters: AIFilters
): Promise<AISearchResult['events']> {
  // ==========================================
  // PASS 1: Strict search — all filters + keywords
  // ==========================================
  const baseConditions = [eq(events.status, 'active')]
  baseConditions.push(...buildDateConditions(filters))

  if (filters.isFree === true) {
    baseConditions.push(eq(events.isFree, true))
  }

  // Category filter
  let categoryId: string | null = null
  if (filters.category) {
    const cat = await db.query.categories?.findFirst({
      where: eq(categories.slug, filters.category),
    })
    if (cat) {
      categoryId = cat.id
      baseConditions.push(eq(events.categoryId, cat.id))
    }
  }

  // Arrondissement filter
  if (filters.arrondissement) {
    baseConditions.push(eq(venues.arrondissement, filters.arrondissement))
  }

  // Keywords — strict: all must match
  const keywordConditions = buildKeywordCondition(filters.keywords)

  const strictConditions = [...baseConditions]
  if (keywordConditions && keywordConditions.length > 0) {
    for (const kc of keywordConditions) {
      if (kc) strictConditions.push(kc)
    }
  }

  let results = await db
    .select({ event: events, venue: venues, category: categories })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(and(...strictConditions))
    .orderBy(desc(events.qualityScore))
    .limit(48)

  // If we got enough results, return them
  if (results.length >= 3) {
    console.log(`[AI Search] Pass 1 (strict): ${results.length} results`)
    return results
  }

  // ==========================================
  // PASS 2: Relaxed — keywords as OR (any keyword matches)
  // ==========================================
  if (filters.keywords.length > 0) {
    const relaxedConditions = [...baseConditions]
    const anyKeyword = filters.keywords.map((kw) => {
      const pattern = `%${kw}%`
      return or(
        ilike(events.title, pattern),
        ilike(events.description, pattern),
        ilike(events.shortDesc, pattern),
        ilike(venues.name, pattern),
        ilike(events.sourceUrl, pattern),
      )
    })
    const combined = anyKeyword.filter(Boolean)
    if (combined.length > 0) {
      relaxedConditions.push(or(...combined)!)
    }

    results = await db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(...relaxedConditions))
      .orderBy(desc(events.qualityScore))
      .limit(48)

    if (results.length >= 3) {
      console.log(`[AI Search] Pass 2 (relaxed keywords): ${results.length} results`)
      return results
    }
  }

  // ==========================================
  // PASS 3: Drop keywords, keep category + date + other filters
  // ==========================================
  if (filters.keywords.length > 0 && (filters.category || filters.dateFilter)) {
    results = await db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(...baseConditions))
      .orderBy(desc(events.qualityScore))
      .limit(48)

    if (results.length > 0) {
      console.log(`[AI Search] Pass 3 (no keywords, category+date only): ${results.length} results`)
      return results
    }
  }

  // ==========================================
  // PASS 4: Last resort — drop date filter too, just category + keywords
  // ==========================================
  if (filters.dateFilter && (filters.category || filters.keywords.length > 0)) {
    const now = new Date()
    const lastResort = [eq(events.status, 'active'), gte(events.startDate, now)]

    if (categoryId) {
      lastResort.push(eq(events.categoryId, categoryId))
    }

    if (filters.keywords.length > 0) {
      const anyKeyword = filters.keywords.map((kw) => {
        const pattern = `%${kw}%`
        return or(
          ilike(events.title, pattern),
          ilike(events.description, pattern),
          ilike(venues.name, pattern),
        )
      })
      const combined = anyKeyword.filter(Boolean)
      if (combined.length > 0) {
        lastResort.push(or(...combined)!)
      }
    }

    results = await db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(...lastResort))
      .orderBy(desc(events.qualityScore))
      .limit(48)

    console.log(`[AI Search] Pass 4 (last resort): ${results.length} results`)
    return results
  }

  // Nothing found at all — return base conditions
  results = await db
    .select({ event: events, venue: venues, category: categories })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(and(...baseConditions))
    .orderBy(desc(events.qualityScore))
    .limit(48)

  console.log(`[AI Search] Fallback (base only): ${results.length} results`)
  return results
}

export async function aiSearch(query: string): Promise<AISearchResult> {
  const filters = await parseQueryWithAI(query)
  console.log(`[AI Search] Filters:`, JSON.stringify(filters))
  const eventsList = await searchWithFilters(filters)
  return { filters, events: eventsList }
}
