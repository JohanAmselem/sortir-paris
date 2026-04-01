import { NextRequest, NextResponse } from 'next/server'
import { db, events, userViews } from '@sortir/db'
import { eq, sql } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'

// POST /api/views — Track an event view
export async function POST(request: NextRequest) {
  const { eventId } = await request.json()

  if (!eventId) {
    return NextResponse.json({ error: 'eventId required' }, { status: 400 })
  }

  // Increment viewCount on the event (works for all users, even anonymous)
  await db
    .update(events)
    .set({ viewCount: sql`${events.viewCount} + 1` })
    .where(eq(events.id, eventId))

  // If user is logged in, also track in user_views
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      await db.insert(userViews).values({
        userId: user.id,
        eventId,
      })
    }
  } catch {
    // Auth errors are non-critical for view tracking
  }

  return NextResponse.json({ ok: true })
}
