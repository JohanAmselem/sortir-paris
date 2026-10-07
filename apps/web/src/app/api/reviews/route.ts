import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, avg, count, desc, eq, sql } from 'drizzle-orm'
import { db, eventReviews, events, users } from '@sortir/db'
import { errors, ensureUserRow, getSessionUser, idSchema, limit, parseBody, parseIdParam } from '@/app/club/_lib/api'
import { syncGamification } from '@/app/club/_lib/member'

export const dynamic = 'force-dynamic'

const COMMENT_MAX = 1000

/** Reviews open once the event has started. */
async function eventState(eventId: string) {
  const [ev] = await db
    .select({ started: sql<boolean>`${events.startDate} <= now()` })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)
  return ev ?? null
}

// GET /api/reviews?eventId= — reviews, stats, the member's own review.
export async function GET(request: NextRequest) {
  const eventId = parseIdParam(request.nextUrl.searchParams.get('eventId'))
  if (!eventId) return errors.badRequest('Identifiant d’événement invalide.')
  try {
    const [ev, reviews, [stats], user] = await Promise.all([
      eventState(eventId),
      db
        .select({
          id: eventReviews.id,
          rating: eventReviews.rating,
          comment: eventReviews.comment,
          createdAt: eventReviews.createdAt,
          userName: users.name,
          userAvatar: users.avatarUrl,
          userId: eventReviews.userId,
        })
        .from(eventReviews)
        .innerJoin(users, eq(eventReviews.userId, users.id))
        .where(eq(eventReviews.eventId, eventId))
        .orderBy(desc(eventReviews.createdAt))
        .limit(50),
      db.select({ avgRating: avg(eventReviews.rating), total: count() }).from(eventReviews).where(eq(eventReviews.eventId, eventId)),
      getSessionUser(),
    ])
    if (!ev) return errors.notFound('Événement introuvable.')
    const mine = user ? reviews.find((r) => r.userId === user.id) : undefined
    return NextResponse.json(
      {
        reviews: reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt,
          userAvatar: r.userAvatar,
          // First name only: reviews are public.
          userName: r.userName ? r.userName.split(/\s+/)[0] : null,
        })),
        stats: {
          avgRating: stats?.avgRating ? Math.round(parseFloat(String(stats.avgRating)) * 10) / 10 : null,
          totalReviews: Number(stats?.total ?? 0),
        },
        userReview: mine ? { rating: mine.rating, comment: mine.comment } : null,
        canReview: Boolean(ev.started),
        loggedIn: Boolean(user),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (err) {
    console.error('[api/reviews] GET failed', err)
    return errors.server()
  }
}

const bodySchema = z.object({
  eventId: idSchema,
  rating: z.number({ message: 'Note invalide.' }).int('Note invalide.').min(1, 'Note entre 1 et 5.').max(5, 'Note entre 1 et 5.'),
  comment: z
    .string()
    .max(COMMENT_MAX, `Ton commentaire dépasse ${COMMENT_MAX} caractères.`)
    .nullish()
    .transform((c) => (c && c.trim() ? c.trim() : null)),
})

// POST /api/reviews — create or update the member's review (event must have started).
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  const limited = limit(request, 'reviews', 10, 60_000, user.id)
  if (limited) return limited
  const body = await parseBody(request, bodySchema)
  if (!body.ok) return body.response
  const { eventId, rating, comment } = body.data

  try {
    const ev = await eventState(eventId)
    if (!ev) return errors.notFound('Événement introuvable.')
    if (!ev.started) {
      return NextResponse.json({ error: 'Tu pourras noter cette sortie une fois qu’elle aura commencé.' }, { status: 409 })
    }
    await ensureUserRow(user)
    await db
      .insert(eventReviews)
      .values({ userId: user.id, eventId, rating, comment })
      .onConflictDoUpdate({
        target: [eventReviews.userId, eventReviews.eventId],
        set: { rating, comment, updatedAt: new Date() },
      })
    const g = await syncGamification(user.id)
    return NextResponse.json({ success: true, xp: g?.xp ?? null, level: g?.level ?? null, newBadges: g?.newBadges ?? [] })
  } catch (err) {
    console.error('[api/reviews] POST failed', err)
    return errors.server()
  }
}

// DELETE /api/reviews?eventId= — delete the member's review (its XP goes with it).
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  const limited = limit(request, 'reviews-delete', 10, 60_000, user.id)
  if (limited) return limited
  const eventId = parseIdParam(request.nextUrl.searchParams.get('eventId'))
  if (!eventId) return errors.badRequest('Identifiant d’événement invalide.')
  try {
    await db.delete(eventReviews).where(and(eq(eventReviews.userId, user.id), eq(eventReviews.eventId, eventId)))
    const g = await syncGamification(user.id)
    return NextResponse.json({ success: true, xp: g?.xp ?? null })
  } catch (err) {
    console.error('[api/reviews] DELETE failed', err)
    return errors.server()
  }
}
