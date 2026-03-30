import { NextRequest, NextResponse } from 'next/server'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm'

// GET /api/events — List events with filters
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50)
  const offset = (page - 1) * limit

  const category = searchParams.get('category')
  const zone = searchParams.get('zone')
  const isFree = searchParams.get('free')
  const dateFilter = searchParams.get('date')
  const sort = searchParams.get('sort') ?? 'date'

  // Build conditions
  const conditions = [eq(events.status, 'active')]

  if (category) {
    const cat = await db.query.categories?.findFirst({
      where: eq(categories.slug, category),
    })
    if (cat) conditions.push(eq(events.categoryId, cat.id))
  }

  if (zone) {
    conditions.push(
      sql`${events.venueId} IN (SELECT id FROM venues WHERE arrondissement = ${zone})`
    )
  }

  if (isFree === 'true') {
    conditions.push(eq(events.isFree, true))
  }

  // Date filters
  const now = new Date()
  if (dateFilter === 'today') {
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)
    conditions.push(gte(events.startDate, now))
    conditions.push(lte(events.startDate, endOfDay))
  } else if (dateFilter === 'weekend') {
    const dayOfWeek = now.getDay()
    const saturday = new Date(now)
    saturday.setDate(now.getDate() + (6 - dayOfWeek))
    saturday.setHours(0, 0, 0, 0)
    const sunday = new Date(saturday)
    sunday.setDate(saturday.getDate() + 1)
    sunday.setHours(23, 59, 59, 999)
    conditions.push(gte(events.startDate, saturday))
    conditions.push(lte(events.startDate, sunday))
  } else if (dateFilter === 'week') {
    const endOfWeek = new Date(now)
    endOfWeek.setDate(now.getDate() + 7)
    conditions.push(gte(events.startDate, now))
    conditions.push(lte(events.startDate, endOfWeek))
  }

  // Sort
  const orderBy =
    sort === 'popular' ? desc(events.saveCount) : desc(events.startDate)

  // Query
  const [results, countResult] = await Promise.all([
    db
      .select({
        event: events,
        venue: venues,
        category: categories,
      })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(events)
      .where(and(...conditions)),
  ])

  const total = Number(countResult[0].count)

  return NextResponse.json({
    data: results,
    total,
    page,
    limit,
    hasMore: offset + limit < total,
  })
}
