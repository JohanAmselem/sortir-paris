import { NextRequest, NextResponse } from 'next/server'
import { meiliAdmin, isMeilisearchEnabled, EVENTS_INDEX } from '@/lib/meilisearch'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, ilike, or, desc, sql } from 'drizzle-orm'

// GET /api/events/search — Meilisearch-powered search with SQL fallback
export async function GET(request: NextRequest) {
  // If Meilisearch is not configured, use SQL fallback
  if (!isMeilisearchEnabled || !meiliAdmin) {
    return sqlFallbackSearch(request)
  }

  const { searchParams } = request.nextUrl

  const query = searchParams.get('q') ?? ''
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50)

  // Build Meilisearch filters
  const filters: string[] = []

  const category = searchParams.get('category')
  if (category) filters.push(`categorySlug = "${category}"`)

  const zone = searchParams.get('zone')
  if (zone) filters.push(`arrondissement = "${zone}"`)

  const isFree = searchParams.get('free')
  if (isFree === 'true') filters.push('isFree = true')

  const dateFilter = searchParams.get('date')
  if (dateFilter === 'today') {
    const now = Math.floor(Date.now() / 1000)
    const endOfDay = now + (86400 - (now % 86400))
    filters.push(`startDate >= ${now}`)
    filters.push(`startDate <= ${endOfDay}`)
  } else if (dateFilter === 'weekend') {
    const now = new Date()
    const dayOfWeek = now.getDay()
    const saturday = new Date(now)
    saturday.setDate(now.getDate() + (6 - dayOfWeek))
    saturday.setHours(0, 0, 0, 0)
    const sunday = new Date(saturday)
    sunday.setDate(saturday.getDate() + 1)
    sunday.setHours(23, 59, 59, 999)
    filters.push(`startDate >= ${Math.floor(saturday.getTime() / 1000)}`)
    filters.push(`startDate <= ${Math.floor(sunday.getTime() / 1000)}`)
  }

  // Note: ambiances is not currently a filterable attribute in Meilisearch
  // const ambiance = searchParams.get('ambiance')
  // if (ambiance) filters.push(`ambiances = "${ambiance}"`)

  // Sort
  const sort = searchParams.get('sort')
  const sortBy: string[] = []
  if (sort === 'date') sortBy.push('startDate:asc')
  else if (sort === 'popular') sortBy.push('saveCount:desc')

  try {
    const index = meiliAdmin.index(EVENTS_INDEX)

    const results = await index.search(query, {
      filter: filters.length > 0 ? filters.join(' AND ') : undefined,
      sort: sortBy.length > 0 ? sortBy : undefined,
      limit,
      offset: (page - 1) * limit,
      attributesToHighlight: ['title'],
      facets: ['categorySlug', 'arrondissement', 'isFree', 'tags'],
    })

    return NextResponse.json({
      data: results.hits,
      total: results.estimatedTotalHits,
      facets: results.facetDistribution,
      page,
      limit,
      hasMore: (page - 1) * limit + limit < (results.estimatedTotalHits ?? 0),
      processingTimeMs: results.processingTimeMs,
    })
  } catch (error) {
    console.error('[Search API] Meilisearch error, falling back to SQL:', error)
    return sqlFallbackSearch(request)
  }
}

// SQL fallback with ILIKE fuzzy matching when Meilisearch is unavailable
async function sqlFallbackSearch(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const query = searchParams.get('q') ?? ''
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50)
  const offset = (page - 1) * limit

  if (!query.trim()) {
    return NextResponse.json({ data: [], total: 0, facets: {}, page, limit, hasMore: false, processingTimeMs: 0 })
  }

  const start = Date.now()

  // Build fuzzy-ish SQL search: split query into words, match ANY with ILIKE
  // For short queries (autocomplete), OR logic gives better results
  // For multi-word queries, require ALL words to match
  const words = query.trim().split(/\s+/).filter(w => w.length >= 2)

  const wordConditions = words.map(word => {
    const pattern = `%${word}%`
    return or(
      ilike(events.title, pattern),
      ilike(events.shortDesc, pattern),
      ilike(venues.name, pattern),
      ilike(events.keywords, pattern),
    )
  })

  // For single-word queries, also search tags and description
  if (words.length === 1) {
    const pattern = `%${words[0]}%`
    wordConditions.push(
      or(
        ilike(events.description, pattern),
        sql`${events.id} IN (
          SELECT et.event_id FROM event_tags et
          INNER JOIN tags t ON t.id = et.tag_id
          WHERE t.name ILIKE ${pattern}
        )`,
      )
    )
  }

  // For multi-word: all words must match somewhere (AND)
  // For single-word: any match is fine (already handled by OR within each word)
  const searchCondition = words.length > 1
    ? and(...wordConditions.filter((c): c is NonNullable<typeof c> => c != null))
    : or(...wordConditions.filter((c): c is NonNullable<typeof c> => c != null))

  const where = and(
    eq(events.status, 'active'),
    gte(events.startDate, new Date()),
    searchCondition ?? undefined,
  )

  const results = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      imageUrl: events.imageUrl,
      startDate: events.startDate,
      isFree: events.isFree,
      priceMin: events.priceMin,
      categorySlug: categories.slug,
      category: categories.name,
      venueName: venues.name,
    })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(where)
    .orderBy(desc(events.qualityScore))
    .limit(limit)
    .offset(offset)

  return NextResponse.json({
    data: results,
    total: results.length,
    facets: {},
    page,
    limit,
    hasMore: results.length === limit,
    processingTimeMs: Date.now() - start,
  })
}
