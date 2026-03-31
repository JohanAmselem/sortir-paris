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
- "keywords": un tableau de mots-clés pertinents pour la recherche textuelle (ex: ["jazz", "photo"]), exclure les mots communs (le, la, de, du, des, un, une, dans, près, ce, cette)

La date d'aujourd'hui est : DATE_TODAY

Réponds UNIQUEMENT avec le JSON, sans commentaire ni explication.`

// Simple fallback parser when AI is unavailable
function parseQueryFallback(query: string): AIFilters {
  const q = query.toLowerCase()
  const stopWords = ['je', 'un', 'une', 'le', 'la', 'les', 'de', 'du', 'des', 'dans', 'pour', 'ce', 'cette', 'mon', 'ma', 'mes', 'cherche', 'recherche', 'veux', 'voudrais', 'aimerais', 'voir', 'trouver', 'soir', 'près', 'chez', 'moi']

  let category: string | null = null
  for (const cat of VALID_CATEGORIES) {
    if (q.includes(cat)) { category = cat; break }
  }
  if (q.includes('jazz') || q.includes('musique') || q.includes('rock')) category = 'concert'
  if (q.includes('photo') || q.includes('exposition') || q.includes('galerie')) category = 'expo'
  if (q.includes('pièce') || q.includes('comédie') || q.includes('comique') || q.includes('humour')) category = 'theatre'

  let dateFilter: 'today' | 'weekend' | 'week' | null = null
  if (q.includes('ce soir') || q.includes("aujourd'hui") || q.includes('aujourd')) dateFilter = 'today'
  else if (q.includes('week-end') || q.includes('weekend') || q.includes('samedi') || q.includes('dimanche')) dateFilter = 'weekend'
  else if (q.includes('semaine') || q.includes('prochains jours')) dateFilter = 'week'

  const isFree = q.includes('gratuit') || q.includes('free') ? true : null

  const arrMatch = q.match(/(\d{1,2})(?:e|er|ème|eme)\s*(?:arr|arrondissement)?/)
  const arrondissement = arrMatch ? `${arrMatch[1]}e` : null

  const keywords = query
    .replace(/['']/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.includes(w.toLowerCase()))
    .slice(0, 5)

  return { category, dateFilter, specificDate: null, isFree, arrondissement, keywords }
}

export async function parseQueryWithAI(query: string): Promise<AIFilters> {
  // Check if API key is configured
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

    // Extract JSON from response (handle potential markdown code blocks)
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

export async function searchWithFilters(
  filters: AIFilters
): Promise<AISearchResult['events']> {
  const now = new Date()
  const conditions = [eq(events.status, 'active')]

  // Date filtering
  if (filters.specificDate) {
    const targetDate = new Date(filters.specificDate)
    targetDate.setHours(0, 0, 0, 0)
    const endOfDay = new Date(filters.specificDate)
    endOfDay.setHours(23, 59, 59, 999)
    conditions.push(lte(events.startDate, endOfDay))
    conditions.push(
      or(gte(events.endDate, targetDate), gte(events.startDate, targetDate))!
    )
  } else if (filters.dateFilter === 'today') {
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)
    conditions.push(gte(events.startDate, now))
    conditions.push(lte(events.startDate, endOfDay))
  } else if (filters.dateFilter === 'weekend') {
    const dayOfWeek = now.getDay()
    const saturday = new Date(now)
    saturday.setDate(now.getDate() + ((6 - dayOfWeek + 7) % 7 || 7))
    saturday.setHours(0, 0, 0, 0)
    // If already Saturday or Sunday, use current date
    if (dayOfWeek === 6) {
      saturday.setDate(now.getDate())
    } else if (dayOfWeek === 0) {
      saturday.setDate(now.getDate() - 1)
    }
    const sunday = new Date(saturday)
    sunday.setDate(saturday.getDate() + 1)
    sunday.setHours(23, 59, 59, 999)
    conditions.push(gte(events.startDate, saturday))
    conditions.push(lte(events.startDate, sunday))
  } else if (filters.dateFilter === 'week') {
    const endOfWeek = new Date(now)
    endOfWeek.setDate(now.getDate() + 7)
    conditions.push(gte(events.startDate, now))
    conditions.push(lte(events.startDate, endOfWeek))
  } else {
    // Default: future events
    conditions.push(gte(events.startDate, now))
  }

  // Free filter
  if (filters.isFree === true) {
    conditions.push(eq(events.isFree, true))
  }

  // Category filter
  if (filters.category) {
    const cat = await db.query.categories?.findFirst({
      where: eq(categories.slug, filters.category),
    })
    if (cat) {
      conditions.push(eq(events.categoryId, cat.id))
    }
  }

  // Arrondissement filter
  if (filters.arrondissement) {
    conditions.push(eq(venues.arrondissement, filters.arrondissement))
  }

  // Keywords search on title and description
  if (filters.keywords.length > 0) {
    const keywordConditions = filters.keywords.map((keyword) =>
      or(
        ilike(events.title, `%${keyword}%`),
        ilike(events.description, `%${keyword}%`)
      )
    )
    const combined = keywordConditions.filter(Boolean)
    if (combined.length > 0) {
      conditions.push(or(...combined)!)
    }
  }

  const results = await db
    .select({ event: events, venue: venues, category: categories })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(desc(events.qualityScore))
    .limit(48)

  return results
}

export async function aiSearch(query: string): Promise<AISearchResult> {
  const filters = await parseQueryWithAI(query)
  const eventsList = await searchWithFilters(filters)
  return { filters, events: eventsList }
}
