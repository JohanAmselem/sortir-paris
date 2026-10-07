import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { db, events, userSaves } from '@sortir/db'
import { ensureUserRow, errors, getSessionUser, idSchema, limit, parseBody } from '@/app/club/_lib/api'
import { getSavedEvents, syncGamification } from '@/app/club/_lib/member'

export const dynamic = 'force-dynamic'

// GET /api/saves — the member's saved events, split upcoming / past.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  try {
    const saved = await getSavedEvents(user.id)
    return NextResponse.json(saved, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    console.error('[api/saves] GET failed', err)
    return errors.server()
  }
}

const bodySchema = z.object({
  eventId: idSchema,
  /** Explicit target state. Omitted → toggle. */
  saved: z.boolean().optional(),
})

// POST /api/saves — save / unsave an event. XP is derived (granted once, removed on unsave).
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  const limited = limit(request, 'saves', 60, 60_000, user.id)
  if (limited) return limited

  const body = await parseBody(request, bodySchema)
  if (!body.ok) return body.response
  const { eventId } = body.data

  try {
    const [event] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).limit(1)
    if (!event) return errors.notFound('Événement introuvable.')

    await ensureUserRow(user)
    const where = and(eq(userSaves.userId, user.id), eq(userSaves.eventId, eventId))
    const target =
      body.data.saved ?? (await db.select({ id: userSaves.eventId }).from(userSaves).where(where).limit(1)).length === 0

    if (target) {
      const inserted = await db.insert(userSaves).values({ userId: user.id, eventId }).onConflictDoNothing().returning()
      if (inserted.length) {
        await db.update(events).set({ saveCount: sql`${events.saveCount} + 1` }).where(eq(events.id, eventId))
      }
    } else {
      const deleted = await db.delete(userSaves).where(where).returning()
      if (deleted.length) {
        await db
          .update(events)
          .set({ saveCount: sql`greatest(${events.saveCount} - 1, 0)` })
          .where(eq(events.id, eventId))
      }
    }

    const g = await syncGamification(user.id)
    return NextResponse.json({ saved: target, xp: g?.xp ?? null, level: g?.level ?? null, newBadges: g?.newBadges ?? [] })
  } catch (err) {
    console.error('[api/saves] POST failed', err)
    return errors.server()
  }
}
