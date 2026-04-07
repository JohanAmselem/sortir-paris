import { NextRequest, NextResponse } from 'next/server'
import { db, userAttendances, events, users } from '@sortir/db'
import { eq, and, sql, count } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { XP_REWARDS } from '@/lib/gamification'

// GET /api/attendance?eventId=xxx — Get attendance info
export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get('eventId')
  if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })

  // Count attendees
  const [stats] = await db
    .select({ count: count() })
    .from(userAttendances)
    .where(eq(userAttendances.eventId, eventId))

  // Get attendee avatars (first 5)
  const attendees = await db
    .select({ name: users.name, avatarUrl: users.avatarUrl })
    .from(userAttendances)
    .innerJoin(users, eq(userAttendances.userId, users.id))
    .where(eq(userAttendances.eventId, eventId))
    .limit(5)

  // Check if current user is attending
  let isAttending = false
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const existing = await db
        .select()
        .from(userAttendances)
        .where(and(eq(userAttendances.userId, user.id), eq(userAttendances.eventId, eventId)))
        .limit(1)
      isAttending = existing.length > 0
    }
  } catch {
    // not logged in
  }

  return NextResponse.json({
    count: Number(stats.count),
    attendees,
    isAttending,
  })
}

// POST /api/attendance — Toggle attendance
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { eventId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { eventId } = body
  if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })

  const existing = await db
    .select()
    .from(userAttendances)
    .where(and(eq(userAttendances.userId, user.id), eq(userAttendances.eventId, eventId)))
    .limit(1)

  if (existing.length > 0) {
    // Remove attendance
    await db
      .delete(userAttendances)
      .where(and(eq(userAttendances.userId, user.id), eq(userAttendances.eventId, eventId)))
    await db
      .update(events)
      .set({ attendanceCount: sql`GREATEST(${events.attendanceCount} - 1, 0)` })
      .where(eq(events.id, eventId))

    // Remove XP
    await db
      .update(users)
      .set({ xp: sql`GREATEST(${users.xp} - ${XP_REWARDS.ATTEND}, 0)` })
      .where(eq(users.id, user.id))

    return NextResponse.json({ attending: false })
  }

  // Add attendance
  await db.insert(userAttendances).values({ userId: user.id, eventId })
  await db
    .update(events)
    .set({ attendanceCount: sql`${events.attendanceCount} + 1` })
    .where(eq(events.id, eventId))

  // Add XP
  await db
    .update(users)
    .set({ xp: sql`${users.xp} + ${XP_REWARDS.ATTEND}` })
    .where(eq(users.id, user.id))

  return NextResponse.json({ attending: true })
}
