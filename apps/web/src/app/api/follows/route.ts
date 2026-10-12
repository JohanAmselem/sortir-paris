import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { db, userFollows } from '@sortir/db'
import { errors, getSessionUser, idSchema, limit, parseBody, parseIdParam } from '@/app/club/_lib/api'
import { listFollows } from '@/app/club/_lib/follows'
import { TERM_MAX, normalizeTerm } from '@/lib/follows'
import { createFollow } from '@/lib/follow-server'

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
    term: z.string().trim().min(2, 'Nom trop court.').max(200, 'Nom trop long.'),
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
    const r = await createFollow(
      user,
      body.data.kind === 'venue' ? { kind: 'venue', venueId: body.data.venueId } : { kind: 'artist', term: body.data.term, label: body.data.label }
    )
    if (!r.ok) return r.status === 404 ? errors.notFound(r.error) : errors.badRequest(r.error)
    return NextResponse.json({ following: true, id: r.id, label: r.label }, { status: r.created ? 201 : 200, headers: noStore })
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
