import { NextRequest, NextResponse } from 'next/server'
import { db, userSaves, events, venues, categories, users } from '@sortir/db'
import { eq, and, sql, desc } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { XP_REWARDS } from '@/lib/gamification'

// GET /api/saves — Get user's saved events with full event data
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const saves = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      imageUrl: events.imageUrl,
      startDate: events.startDate,
      isFree: events.isFree,
      priceMin: events.priceMin,
      priceMax: events.priceMax,
      venueName: venues.name,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      savedAt: userSaves.createdAt,
    })
    .from(userSaves)
    .innerJoin(events, eq(userSaves.eventId, events.id))
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(eq(userSaves.userId, user.id))
    .orderBy(desc(userSaves.createdAt))

  return NextResponse.json({ events: saves })
}

// POST /api/saves — Toggle save on an event
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { eventId } = await request.json()

  if (!eventId) {
    return NextResponse.json({ error: 'eventId required' }, { status: 400 })
  }

  // Check if already saved
  const existing = await db
    .select()
    .from(userSaves)
    .where(and(eq(userSaves.userId, user.id), eq(userSaves.eventId, eventId)))
    .limit(1)

  if (existing.length > 0) {
    // Unsave
    await db
      .delete(userSaves)
      .where(and(eq(userSaves.userId, user.id), eq(userSaves.eventId, eventId)))

    await db
      .update(events)
      .set({ saveCount: sql`${events.saveCount} - 1` })
      .where(eq(events.id, eventId))

    return NextResponse.json({ saved: false })
  }

  // Save
  await db.insert(userSaves).values({ userId: user.id, eventId })

  await db
    .update(events)
    .set({ saveCount: sql`${events.saveCount} + 1` })
    .where(eq(events.id, eventId))

  // Award XP
  await db
    .update(users)
    .set({ xp: sql`${users.xp} + ${XP_REWARDS.SAVE}` })
    .where(eq(users.id, user.id))

  return NextResponse.json({ saved: true })
}
