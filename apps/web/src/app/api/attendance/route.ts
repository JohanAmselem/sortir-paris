import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, count, eq, sql } from 'drizzle-orm'
import { db, events, userAttendances } from '@sortir/db'
import { effectiveEndSql } from '@/lib/events/query'
import { ensureUserRow, errors, getSessionUser, idSchema, limit, parseBody, parseIdParam } from '@/app/club/_lib/api'
import { syncGamification } from '@/app/club/_lib/member'

export const dynamic = 'force-dynamic'

/** « J'y vais » is accepted until one day after the event ended. */
const GRACE = sql`interval '1 day'`

// GET /api/attendance?eventId= — count + whether the current member goes.
export async function GET(request: NextRequest) {
  const eventId = parseIdParam(request.nextUrl.searchParams.get('eventId'))
  if (!eventId) return errors.badRequest('Identifiant d’événement invalide.')
  try {
    const [[stats], [ev], user] = await Promise.all([
      db.select({ n: count() }).from(userAttendances).where(eq(userAttendances.eventId, eventId)),
      db
        .select({ open: sql<boolean>`${effectiveEndSql} + ${GRACE} >= now()` })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1),
      getSessionUser(),
    ])
    if (!ev) return errors.notFound('Événement introuvable.')
    let isAttending = false
    if (user) {
      const rows = await db
        .select({ id: userAttendances.eventId })
        .from(userAttendances)
        .where(and(eq(userAttendances.userId, user.id), eq(userAttendances.eventId, eventId)))
        .limit(1)
      isAttending = rows.length > 0
    }
    return NextResponse.json(
      { count: Number(stats?.n ?? 0), isAttending, open: Boolean(ev.open) },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (err) {
    console.error('[api/attendance] GET failed', err)
    return errors.server()
  }
}

const bodySchema = z.object({ eventId: idSchema, attending: z.boolean().optional() })

// POST /api/attendance — toggle « J'y vais ».
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  const limited = limit(request, 'attendance', 30, 60_000, user.id)
  if (limited) return limited
  const body = await parseBody(request, bodySchema)
  if (!body.ok) return body.response
  const { eventId } = body.data

  try {
    const [ev] = await db
      .select({ open: sql<boolean>`${effectiveEndSql} + ${GRACE} >= now()` })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1)
    if (!ev) return errors.notFound('Événement introuvable.')

    await ensureUserRow(user)
    const where = and(eq(userAttendances.userId, user.id), eq(userAttendances.eventId, eventId))
    const target =
      body.data.attending ??
      (await db.select({ id: userAttendances.eventId }).from(userAttendances).where(where).limit(1)).length === 0

    if (target) {
      if (!ev.open) return jsonClosed()
      const inserted = await db.insert(userAttendances).values({ userId: user.id, eventId }).onConflictDoNothing().returning()
      if (inserted.length) {
        await db.update(events).set({ attendanceCount: sql`${events.attendanceCount} + 1` }).where(eq(events.id, eventId))
      }
    } else {
      const deleted = await db.delete(userAttendances).where(where).returning()
      if (deleted.length) {
        await db
          .update(events)
          .set({ attendanceCount: sql`greatest(${events.attendanceCount} - 1, 0)` })
          .where(eq(events.id, eventId))
      }
    }

    const g = await syncGamification(user.id)
    return NextResponse.json({ attending: target, xp: g?.xp ?? null, level: g?.level ?? null, newBadges: g?.newBadges ?? [] })
  } catch (err) {
    console.error('[api/attendance] POST failed', err)
    return errors.server()
  }
}

function jsonClosed() {
  return NextResponse.json({ error: 'Cet événement est terminé depuis plus d’un jour.' }, { status: 409 })
}
