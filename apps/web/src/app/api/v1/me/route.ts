import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { and, asc, eq, sql } from 'drizzle-orm'
import { alertSettings, db, events, userAttendances, users } from '@sortir/db'
import { ensureUserRow, errors, getSessionUser, limit, parseBody } from '@/app/club/_lib/api'
import { getCardsByIds, getSavedEvents } from '@/app/club/_lib/member'
import { getFollowFeed } from '@/app/club/_lib/follows'
import { effectiveEndSql } from '@/lib/events/query'
import { deleteAccount } from '@/lib/api-v1/account'
import type { MeResponse } from '@/lib/api-v1/contract'

/**
 * GET    /api/v1/me — le profil du membre connecté : sorties gardées, J'y vais,
 *        suivis, réglages d'alertes. Crée la fiche membre au premier appel.
 * PATCH  /api/v1/me — réglages d'alertes, y compris le Drop du lundi.
 * DELETE /api/v1/me {confirm: "SUPPRIMER"} — suppression définitive du compte.
 */
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  try {
    await ensureUserRow(user)
    const [[row], saved, attendingIds, feed, [settings]] = await Promise.all([
      db.select({ name: users.name, avatarUrl: users.avatarUrl, onboarded: users.onboarded }).from(users).where(eq(users.id, user.id)).limit(1),
      getSavedEvents(user.id),
      db
        .select({ id: userAttendances.eventId })
        .from(userAttendances)
        .innerJoin(events, eq(userAttendances.eventId, events.id))
        .where(and(eq(userAttendances.userId, user.id), sql`${effectiveEndSql} >= now()`))
        .orderBy(asc(events.startDate))
        .limit(100),
      getFollowFeed(user.id),
      db
        .select({
          emailEnabled: alertSettings.emailEnabled,
          pushEnabled: alertSettings.pushEnabled,
          notifyNewDate: alertSettings.notifyNewDate,
          notifyOnSale: alertSettings.notifyOnSale,
          notifyReminder: alertSettings.notifyReminder,
          notifyDrop: alertSettings.notifyDrop,
        })
        .from(alertSettings)
        .where(eq(alertSettings.userId, user.id))
        .limit(1),
    ])
    const attending = await getCardsByIds(attendingIds.map((r) => r.id))
    const providers = Array.isArray(user.app_metadata?.providers) ? (user.app_metadata.providers as string[]) : []
    const body = {
      id: user.id,
      email: user.email ?? null,
      name: row?.name ?? null,
      avatarUrl: row?.avatarUrl ?? null,
      providers,
      onboarded: Boolean(row?.onboarded),
      saved,
      attending,
      follows: feed.follows.map((f) => ({ id: f.id, kind: f.kind, label: f.label, term: f.term, venueSlug: f.venueSlug ?? null })),
      newForYou: feed.newCount,
      alerts: settings ?? {
        emailEnabled: true,
        pushEnabled: false,
        notifyNewDate: true,
        notifyOnSale: true,
        notifyReminder: true,
        notifyDrop: true,
      },
    } satisfies MeResponse
    return NextResponse.json(body, { headers: noStore })
  } catch (err) {
    console.error('[api/v1/me] GET failed', err)
    return errors.server()
  }
}

const patchSchema = z
  .object({
    emailEnabled: z.boolean(),
    pushEnabled: z.boolean(),
    notifyNewDate: z.boolean(),
    notifyOnSale: z.boolean(),
    notifyReminder: z.boolean(),
    notifyDrop: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Rien à modifier.' })

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  const limited = limit(request, 'v1-me-patch', 30, 60_000, user.id)
  if (limited) return limited
  const body = await parseBody(request, patchSchema)
  if (!body.ok) return body.response
  try {
    await ensureUserRow(user)
    const [row] = await db
      .insert(alertSettings)
      .values({ userId: user.id, ...body.data })
      .onConflictDoUpdate({ target: alertSettings.userId, set: { ...body.data, updatedAt: new Date() } })
      .returning({
        emailEnabled: alertSettings.emailEnabled,
        pushEnabled: alertSettings.pushEnabled,
        notifyNewDate: alertSettings.notifyNewDate,
        notifyOnSale: alertSettings.notifyOnSale,
        notifyReminder: alertSettings.notifyReminder,
        notifyDrop: alertSettings.notifyDrop,
      })
    return NextResponse.json({ alerts: row }, { headers: noStore })
  } catch (err) {
    console.error('[api/v1/me] PATCH failed', err)
    return errors.server()
  }
}

const deleteSchema = z.object({ confirm: z.literal('SUPPRIMER', { message: 'Confirmation manquante.' }) })

export async function DELETE(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  const limited = limit(request, 'v1-me-delete', 3, 60_000, user.id)
  if (limited) return limited
  const body = await parseBody(request, deleteSchema)
  if (!body.ok) return body.response
  try {
    await deleteAccount(user.id, user.email)
    console.warn('[api/v1/me] account deleted', user.id.slice(0, 8))
    return NextResponse.json({ deleted: true }, { headers: noStore })
  } catch (err) {
    console.error('[api/v1/me] DELETE failed', err)
    return errors.server()
  }
}
