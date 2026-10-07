import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db, events, userSwipes } from '@sortir/db'
import { diversify, effectiveEndSql, safeQueryEvents } from '@/lib/events/query'
import { parisDayStart } from '@/lib/paris-time'
import { ensureUserRow, errors, getSessionUser, idSchema, limit, parseBody } from '@/app/club/_lib/api'
import { getCardsByIds, getSwipedIds, syncGamification } from '@/app/club/_lib/member'
import { interleaveByCategory, MATCH_DAILY_LIMIT, MATCH_IMPORT_MAX } from '@/app/club/_lib/deck'

export const dynamic = 'force-dynamic'

async function swipesToday(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(userSwipes)
    .where(and(eq(userSwipes.userId, userId), gte(userSwipes.createdAt, parisDayStart())))
  return Number(row?.n ?? 0)
}

// GET /api/swipe — a deck of upcoming events with pictures (anonymous OK).
// Members also get their quota and their recent likes.
export async function GET() {
  const user = await getSessionUser()
  try {
    const [best, fresh, swiped, today] = await Promise.all([
      safeQueryEvents({ when: 'month', withImage: true, sort: 'relevance', limit: 100 }),
      safeQueryEvents({ when: 'week', withImage: true, sort: 'random', limit: 60 }),
      user ? getSwipedIds(user.id) : Promise.resolve([] as string[]),
      user ? swipesToday(user.id) : Promise.resolve(0),
    ])
    if (best.error && fresh.error) return errors.server()

    // Alternate the editorial ranking with a random slice so the deck feels alive.
    const ranked = diversify(best.events, 100)
    const mixed: typeof ranked = []
    for (let i = 0, j = 0; i < ranked.length || j < fresh.events.length; i++) {
      if (ranked[i]) mixed.push(ranked[i])
      // One random pick every two ranked ones.
      if ((i % 2 === 1 || i >= ranked.length) && fresh.events[j]) mixed.push(fresh.events[j++])
    }
    const deck = interleaveByCategory(mixed, swiped, 40)

    let liked: Awaited<ReturnType<typeof getCardsByIds>> = []
    if (user) {
      const rows = await db
        .select({ id: userSwipes.eventId })
        .from(userSwipes)
        .innerJoin(events, eq(events.id, userSwipes.eventId))
        .where(and(eq(userSwipes.userId, user.id), eq(userSwipes.direction, 'right'), sql`${effectiveEndSql} >= now()`))
        .orderBy(desc(userSwipes.createdAt))
        .limit(12)
      liked = await getCardsByIds(rows.map((r) => r.id))
    }

    return NextResponse.json(
      {
        events: deck,
        loggedIn: Boolean(user),
        swipesToday: today,
        dailyLimit: MATCH_DAILY_LIMIT,
        remaining: Math.max(0, MATCH_DAILY_LIMIT - today),
        liked,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (err) {
    console.error('[api/swipe] GET failed', err)
    return errors.server()
  }
}

const swipe = z.object({ eventId: idSchema, direction: z.enum(['left', 'right'], { message: 'Direction invalide.' }) })
const bodySchema = z.union([
  swipe,
  // Import of the swipes made before logging in (localStorage).
  z.object({ swipes: z.array(swipe).min(1).max(MATCH_IMPORT_MAX) }),
])

// POST /api/swipe — record one swipe (daily quota, Paris day) or import local swipes.
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  const body = await parseBody(request, bodySchema)
  if (!body.ok) return body.response
  const isImport = 'swipes' in body.data
  const limited = isImport
    ? limit(request, 'swipe-import', 5, 60 * 60_000, user.id)
    : limit(request, 'swipe', 40, 60_000, user.id)
  if (limited) return limited

  try {
    await ensureUserRow(user)
    const today = await swipesToday(user.id)
    const list = 'swipes' in body.data ? body.data.swipes : [body.data]

    if (!isImport && today >= MATCH_DAILY_LIMIT) {
      return NextResponse.json(
        { error: 'Tu as atteint la limite du jour. Reviens demain pour de nouvelles cartes !', limitReached: true },
        { status: 429 }
      )
    }

    // Keep only existing events (FK) and one swipe per event.
    const unique = new Map(list.map((s) => [s.eventId, s.direction]))
    const existing = await db
      .select({ id: events.id })
      .from(events)
      .where(inArray(events.id, [...unique.keys()]))
    if (!existing.length) return errors.notFound('Événement introuvable.')

    const inserted = await db
      .insert(userSwipes)
      .values(existing.map((e) => ({ userId: user.id, eventId: e.id, direction: unique.get(e.id)! })))
      .onConflictDoNothing()
      .returning({ id: userSwipes.id })

    const g = inserted.length ? await syncGamification(user.id) : null
    const count = isImport ? today : today + inserted.length
    return NextResponse.json({
      success: true,
      recorded: inserted.length,
      swipesToday: count,
      remaining: Math.max(0, MATCH_DAILY_LIMIT - count),
      xp: g?.xp ?? null,
      newBadges: g?.newBadges ?? [],
    })
  } catch (err) {
    console.error('[api/swipe] POST failed', err)
    return errors.server()
  }
}
