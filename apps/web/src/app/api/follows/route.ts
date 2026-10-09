import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, count, eq, sql } from 'drizzle-orm'
import { db, userFollows, venues } from '@sortir/db'
import { ensureUserRow, errors, getSessionUser, idSchema, limit, parseBody, parseIdParam } from '@/app/club/_lib/api'
import { listFollows } from '@/app/club/_lib/follows'
import { MAX_FOLLOWS, TERM_MAX, isValidTerm, normalizeTerm } from '@/lib/follows'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

// GET /api/follows — the member's follows.
// GET /api/follows?venueId=… | ?term=… — whether the member follows that target.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const venueParam = params.get('venueId')
  const termParam = params.get('term')
  const user = await getSessionUser()
  if (!user) {
    // Button state for visitors: not following (no 401 noise on public pages).
    if (venueParam != null || termParam != null) return NextResponse.json({ following: false, id: null }, { headers: noStore })
    return errors.unauthorized()
  }
  try {
    if (venueParam != null || termParam != null) {
      const venueId = venueParam != null ? parseIdParam(venueParam) : null
      const term = termParam != null ? normalizeTerm(termParam.slice(0, 200)).slice(0, TERM_MAX).trim() : null
      if (venueParam != null && !venueId) return errors.badRequest('Identifiant de lieu invalide.')
      if (termParam != null && !term) return errors.badRequest('Nom invalide.')
      const rows = await db
        .select({ id: userFollows.id })
        .from(userFollows)
        .where(
          and(
            eq(userFollows.userId, user.id),
            venueId
              ? and(
                  eq(userFollows.kind, 'venue'),
                  sql`${userFollows.venueId} in (select coalesce(canonical_venue_id, id) from venues where id = ${venueId})`
                )
              : and(eq(userFollows.kind, 'artist'), eq(userFollows.term, term!))
          )
        )
        .limit(1)
      return NextResponse.json({ following: rows.length > 0, id: rows[0]?.id ?? null }, { headers: noStore })
    }
    const follows = await listFollows(user.id)
    return NextResponse.json({ follows }, { headers: noStore })
  } catch (err) {
    console.error('[api/follows] GET failed', err)
    return errors.server()
  }
}

const postSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('venue'), venueId: idSchema }),
  z.object({
    kind: z.literal('artist'),
    term: z.string().trim().min(3, 'Nom trop court.').max(200, 'Nom trop long.'),
    label: z.string().trim().min(1).max(160).optional(),
  }),
])

// POST /api/follows — follow a venue or an artist / work. Idempotent.
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  const limited = limit(request, 'follows', 30, 60_000, user.id)
  if (limited) return limited
  const body = await parseBody(request, postSchema)
  if (!body.ok) return body.response

  try {
    let values: typeof userFollows.$inferInsert
    if (body.data.kind === 'venue') {
      const [v] = await db
        .select({ id: venues.id, name: venues.name, canonicalId: venues.canonicalVenueId })
        .from(venues)
        .where(eq(venues.id, body.data.venueId))
        .limit(1)
      if (!v) return errors.notFound('Lieu introuvable.')
      let target = { id: v.id, name: v.name }
      // Merged venues: always follow the canonical one.
      if (v.canonicalId) {
        const [c] = await db.select({ id: venues.id, name: venues.name }).from(venues).where(eq(venues.id, v.canonicalId)).limit(1)
        if (c) target = c
      }
      values = { userId: user.id, kind: 'venue', venueId: target.id, term: null, label: target.name.slice(0, 160) }
    } else {
      const term = normalizeTerm(body.data.term).slice(0, TERM_MAX).trim()
      if (!isValidTerm(term)) return errors.badRequest('Ce nom est trop court pour être suivi.')
      const label = (body.data.label ?? body.data.term).replace(/\s+/g, ' ').slice(0, 160)
      values = { userId: user.id, kind: 'artist', venueId: null, term, label }
    }

    const [{ n }] = await db.select({ n: count() }).from(userFollows).where(eq(userFollows.userId, user.id))
    await ensureUserRow(user)
    const existing = await db
      .select({ id: userFollows.id })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.userId, user.id),
          eq(userFollows.kind, values.kind),
          values.kind === 'venue' ? eq(userFollows.venueId, values.venueId!) : eq(userFollows.term, values.term!)
        )
      )
      .limit(1)
    if (existing[0]) return NextResponse.json({ following: true, id: existing[0].id }, { headers: noStore })
    if (Number(n) >= MAX_FOLLOWS) {
      return errors.badRequest(`Tu suis déjà ${MAX_FOLLOWS} lieux et artistes : retire-en un depuis ton compte.`)
    }
    const inserted = await db.insert(userFollows).values(values).onConflictDoNothing().returning({ id: userFollows.id })
    return NextResponse.json({ following: true, id: inserted[0]?.id ?? null }, { status: 201, headers: noStore })
  } catch (err) {
    console.error('[api/follows] POST failed', err)
    return errors.server()
  }
}

const deleteSchema = z.union([
  z.object({ id: idSchema }),
  z.object({ kind: z.literal('venue'), venueId: idSchema }),
  z.object({ kind: z.literal('artist'), term: z.string().trim().min(1).max(200) }),
])

// DELETE /api/follows — unfollow, by follow id or by target.
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  const limited = limit(request, 'follows', 30, 60_000, user.id)
  if (limited) return limited
  const body = await parseBody(request, deleteSchema)
  if (!body.ok) return body.response
  const d = body.data

  try {
    const target =
      'id' in d
        ? eq(userFollows.id, d.id)
        : d.kind === 'venue'
          ? and(
              eq(userFollows.kind, 'venue'),
              // The page may show an alias: match the venue or its canonical one.
              sql`${userFollows.venueId} in (select coalesce(canonical_venue_id, id) from venues where id = ${d.venueId})`
            )
          : and(eq(userFollows.kind, 'artist'), eq(userFollows.term, normalizeTerm(d.term).slice(0, TERM_MAX).trim()))
    await db.delete(userFollows).where(and(eq(userFollows.userId, user.id), target))
    return NextResponse.json({ following: false }, { headers: noStore })
  } catch (err) {
    console.error('[api/follows] DELETE failed', err)
    return errors.server()
  }
}

const patchSchema = z.object({
  /** Omitted → every follow of the member. */
  id: idSchema.optional(),
  seen: z.literal(true),
})

// PATCH /api/follows — « Marquer comme vu »: news start again from now.
export async function PATCH(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  const limited = limit(request, 'follows-seen', 30, 60_000, user.id)
  if (limited) return limited
  const body = await parseBody(request, patchSchema)
  if (!body.ok) return body.response
  try {
    const where = body.data.id
      ? and(eq(userFollows.userId, user.id), eq(userFollows.id, body.data.id))
      : eq(userFollows.userId, user.id)
    await db.update(userFollows).set({ lastSeenAt: new Date() }).where(where)
    return NextResponse.json({ ok: true }, { headers: noStore })
  } catch (err) {
    console.error('[api/follows] PATCH failed', err)
    return errors.server()
  }
}
