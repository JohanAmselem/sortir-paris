import { NextRequest, NextResponse } from 'next/server'
import { db, userSwipes, events, venues, categories, users, userSaves } from '@sortir/db'
import { eq, and, gte, notInArray, sql, desc } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { XP_REWARDS } from '@/lib/gamification'

// GET /api/swipe — Get next batch of events to swipe
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get already swiped event IDs
  const swipedIds = await db
    .select({ eventId: userSwipes.eventId })
    .from(userSwipes)
    .where(eq(userSwipes.userId, user.id))

  const excludeIds = swipedIds.map(s => s.eventId)

  // Get today's swipe count
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [todayStats] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userSwipes)
    .where(and(eq(userSwipes.userId, user.id), gte(userSwipes.createdAt, today)))

  const swipesToday = todayStats.count

  // Get next events to show (not already swiped)
  const now = new Date()
  const conditions = [
    eq(events.status, 'active'),
    gte(events.startDate, now),
  ]
  if (excludeIds.length > 0) {
    conditions.push(notInArray(events.id, excludeIds))
  }

  const nextEvents = await db
    .select({ event: events, venue: venues, category: categories })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(desc(events.qualityScore))
    .limit(10)

  const batch = nextEvents.map(r => ({
    ...r.event,
    venue: r.venue,
    category: r.category,
  }))

  return NextResponse.json({
    events: batch,
    swipesToday,
    dailyLimit: 15,
    remaining: Math.max(0, 15 - swipesToday),
  })
}

// POST /api/swipe — Record a swipe
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId, direction } = await request.json()
  if (!eventId || !['right', 'left'].includes(direction)) {
    return NextResponse.json({ error: 'eventId and direction (right/left) required' }, { status: 400 })
  }

  // Check daily limit
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [todayStats] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userSwipes)
    .where(and(eq(userSwipes.userId, user.id), gte(userSwipes.createdAt, today)))

  if (todayStats.count >= 15) {
    return NextResponse.json({ error: 'Daily swipe limit reached', limitReached: true }, { status: 429 })
  }

  // Insert swipe (ignore if duplicate)
  try {
    await db.insert(userSwipes).values({
      userId: user.id,
      eventId,
      direction,
    })
  } catch {
    // duplicate, ignore
    return NextResponse.json({ success: true, duplicate: true })
  }

  // If right swipe, also auto-save
  if (direction === 'right') {
    try {
      await db.insert(userSaves).values({ userId: user.id, eventId })
      await db
        .update(events)
        .set({ saveCount: sql`${events.saveCount} + 1` })
        .where(eq(events.id, eventId))
    } catch {
      // already saved
    }
  }

  // Add XP
  await db
    .update(users)
    .set({ xp: sql`${users.xp} + ${XP_REWARDS.SWIPE}` })
    .where(eq(users.id, user.id))

  return NextResponse.json({ success: true, swipesToday: todayStats.count + 1 })
}
