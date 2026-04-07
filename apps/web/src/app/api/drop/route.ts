import { NextResponse } from 'next/server'
import { db, weeklyDrops, events, venues, categories, users, userPreferences, userSaves, userSwipes } from '@sortir/db'
import { eq, and, gte, lte, desc, notInArray, inArray, sql } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'

function getMonday(d: Date) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

// GET /api/drop — Get this week's personalized drop
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const monday = getMonday(new Date())
  const mondayStr = monday.toISOString().split('T')[0]

  // Check if drop already exists for this week
  const existingDrop = await db
    .select()
    .from(weeklyDrops)
    .where(and(eq(weeklyDrops.userId, user.id), eq(weeklyDrops.weekStart, mondayStr)))
    .limit(1)

  let eventIds: string[]

  if (existingDrop.length > 0) {
    eventIds = existingDrop[0].eventIds.split(',').filter(Boolean)
  } else {
    // Generate new drop
    eventIds = await generateDrop(user.id, monday)
    if (eventIds.length > 0) {
      await db.insert(weeklyDrops).values({
        userId: user.id,
        eventIds: eventIds.join(','),
        weekStart: mondayStr,
      })
    }
  }

  if (eventIds.length === 0) {
    return NextResponse.json({ events: [], weekStart: mondayStr })
  }

  // Fetch full event data
  const dropEvents = await db
    .select({ event: events, venue: venues, category: categories })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(inArray(events.id, eventIds))

  const mapped = dropEvents.map(r => ({
    ...r.event,
    venue: r.venue,
    category: r.category,
    tags: [],
    ambiances: [],
  }))

  return NextResponse.json({
    events: mapped,
    weekStart: mondayStr,
    isNew: existingDrop.length === 0,
  })
}

async function generateDrop(userId: string, monday: Date): Promise<string[]> {
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  // Get user preferences
  const prefs = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)

  // Get events the user already saved or swiped right
  const [savedIds, swipedIds] = await Promise.all([
    db.select({ eventId: userSaves.eventId }).from(userSaves).where(eq(userSaves.userId, userId)),
    db.select({ eventId: userSwipes.eventId }).from(userSwipes)
      .where(and(eq(userSwipes.userId, userId), eq(userSwipes.direction, 'right'))),
  ])
  const alreadyKnown = new Set([...savedIds.map(s => s.eventId), ...swipedIds.map(s => s.eventId)])

  // Build base query conditions
  const conditions = [
    eq(events.status, 'active'),
    gte(events.startDate, monday),
    lte(events.startDate, sunday),
  ]

  // If user has category preferences, favor those
  let preferredCategoryIds: string[] = []
  if (prefs.length > 0 && prefs[0].categories.length > 0) {
    preferredCategoryIds = prefs[0].categories
  }

  // Get top events for this week, prioritizing user preferences
  const weekEvents = await db
    .select({ event: events })
    .from(events)
    .where(and(...conditions))
    .orderBy(
      // Prefer events in user's categories
      preferredCategoryIds.length > 0
        ? desc(sql`CASE WHEN ${events.categoryId} = ANY(${preferredCategoryIds}::uuid[]) THEN 1 ELSE 0 END`)
        : desc(events.qualityScore),
      desc(events.qualityScore),
      desc(sql`${events.saveCount} + ${events.viewCount}`)
    )
    .limit(30)

  // Filter out already known events and pick 5
  const candidates = weekEvents
    .filter(r => !alreadyKnown.has(r.event.id))
    .map(r => r.event.id)

  // Pick up to 5, mixing categories if possible
  return candidates.slice(0, 5)
}
