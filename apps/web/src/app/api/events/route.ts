import { NextRequest, NextResponse } from 'next/server'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, lte, sql, desc, asc } from 'drizzle-orm'

// GET /api/events — List events with filters
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50)
  const offset = (page - 1) * limit

  const category = searchParams.get('category')
  const zone = searchParams.get('zone') ?? searchParams.get('arr')
  const isFree = searchParams.get('free')
  const dateFilter = searchParams.get('date')
  const sort = searchParams.get('sort') ?? 'date'
  const userLat = searchParams.get('lat')
  const userLng = searchParams.get('lng')
  const ambiance = searchParams.get('ambiance')

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
      sql`${events.venueId} IN (SELECT id FROM venues WHERE arrondissement ILIKE ${'%' + zone + '%'})`
    )
  }

  if (isFree === 'true') {
    conditions.push(eq(events.isFree, true))
  }

  if (ambiance) {
    conditions.push(
      sql`${events.id} IN (
        SELECT ea.event_id FROM event_ambiances ea
        JOIN ambiances a ON a.id = ea.ambiance_id
        WHERE a.slug = ${ambiance}
      )`
    )
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
    let weekendStart: Date
    let weekendEnd: Date
    if (dayOfWeek === 0) {
      weekendStart = now
      weekendEnd = new Date(now)
      weekendEnd.setHours(23, 59, 59, 999)
    } else if (dayOfWeek === 6) {
      weekendStart = new Date(now)
      weekendStart.setHours(0, 0, 0, 0)
      weekendEnd = new Date(now)
      weekendEnd.setDate(now.getDate() + 1)
      weekendEnd.setHours(23, 59, 59, 999)
    } else {
      weekendStart = new Date(now)
      weekendStart.setDate(now.getDate() + (6 - dayOfWeek))
      weekendStart.setHours(0, 0, 0, 0)
      weekendEnd = new Date(weekendStart)
      weekendEnd.setDate(weekendStart.getDate() + 1)
      weekendEnd.setHours(23, 59, 59, 999)
    }
    conditions.push(gte(events.startDate, weekendStart))
    conditions.push(lte(events.startDate, weekendEnd))
  } else if (dateFilter === 'week') {
    const endOfWeek = new Date(now)
    endOfWeek.setDate(now.getDate() + 7)
    conditions.push(gte(events.startDate, now))
    conditions.push(lte(events.startDate, endOfWeek))
  } else if (dateFilter && /^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
    const target = new Date(dateFilter + 'T00:00:00')
    const endOfTarget = new Date(dateFilter + 'T23:59:59.999')
    conditions.push(gte(events.startDate, target))
    conditions.push(lte(events.startDate, endOfTarget))
  } else {
    // Default: future events only
    conditions.push(gte(events.startDate, now))
  }

  // Sort — if user provided geolocation, sort by distance
  const hasGeo = userLat && userLng && !isNaN(parseFloat(userLat)) && !isNaN(parseFloat(userLng))
  const distanceExpr = hasGeo
    ? sql`(${venues.lat} - ${parseFloat(userLat!)}) * (${venues.lat} - ${parseFloat(userLat!)}) + (${venues.lng} - ${parseFloat(userLng!)}) * (${venues.lng} - ${parseFloat(userLng!)})`
    : null

  const orderBy = hasGeo && distanceExpr
    ? asc(distanceExpr)
    : sort === 'popular' ? desc(events.saveCount) : sort === 'quality' ? desc(events.qualityScore) : desc(events.startDate)

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
