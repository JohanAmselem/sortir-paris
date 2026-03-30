import { NextRequest, NextResponse } from 'next/server'
import { meiliAdmin, isMeilisearchEnabled, EVENTS_INDEX } from '@/lib/meilisearch'

// GET /api/events/search — Meilisearch-powered search
export async function GET(request: NextRequest) {
  // If Meilisearch is not configured, return empty results
  if (!isMeilisearchEnabled || !meiliAdmin) {
    return NextResponse.json({
      data: [],
      total: 0,
      facets: {},
      page: 1,
      limit: 20,
      hasMore: false,
      processingTimeMs: 0,
      message: 'Search not available — Meilisearch not configured',
    })
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

  const ambiance = searchParams.get('ambiance')
  if (ambiance) filters.push(`ambiances = "${ambiance}"`)

  // Sort
  const sort = searchParams.get('sort')
  const sortBy: string[] = []
  if (sort === 'date') sortBy.push('startDate:asc')
  else if (sort === 'popular') sortBy.push('saveCount:desc')

  const index = meiliAdmin.index(EVENTS_INDEX)

  const results = await index.search(query, {
    filter: filters.length > 0 ? filters.join(' AND ') : undefined,
    sort: sortBy.length > 0 ? sortBy : undefined,
    limit,
    offset: (page - 1) * limit,
    attributesToHighlight: ['title'],
    facets: ['categorySlug', 'arrondissement', 'isFree', 'ambiances'],
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
}
