import { NextRequest, NextResponse } from 'next/server'
import { db, userSaves, events } from '@sortir/db'
import { eq, and, sql } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'

// GET /api/saves — Get user's saved events
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const saves = await db
    .select()
    .from(userSaves)
    .where(eq(userSaves.userId, user.id))
    .orderBy(userSaves.createdAt)

  return NextResponse.json(saves)
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

  return NextResponse.json({ saved: true })
}
