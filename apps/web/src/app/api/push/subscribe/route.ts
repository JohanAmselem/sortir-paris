import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, count, eq } from 'drizzle-orm'
import { alertSettings, db, pushSubscriptions } from '@sortir/db'
import { ensureUserRow, errors, getSessionUser, limit, parseBody } from '@/app/club/_lib/api'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }
/** Browsers / devices per member. */
const MAX_SUBSCRIPTIONS = 10

const endpointSchema = z
  .string()
  .max(1000)
  .refine((v) => {
    try {
      return new URL(v).protocol === 'https:'
    } catch {
      return false
    }
  }, 'Abonnement invalide.')

const postSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
})

// POST /api/push/subscribe — save this browser's push subscription and turn push alerts on.
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  const limited = limit(request, 'push-subscribe', 10, 60_000, user.id)
  if (limited) return limited
  const body = await parseBody(request, postSchema)
  if (!body.ok) return body.response
  const { endpoint, keys } = body.data
  try {
    await ensureUserRow(user)
    const [{ n }] = await db.select({ n: count() }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id))
    if (Number(n) >= MAX_SUBSCRIPTIONS) {
      // Oldest device out: keeps the table bounded without blocking a new phone.
      const [oldest] = await db
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, user.id))
        .orderBy(pushSubscriptions.createdAt)
        .limit(1)
      if (oldest) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, oldest.id))
    }
    // Same browser re-subscribing (or switching account): the endpoint is unique.
    await db
      .insert(pushSubscriptions)
      .values({ userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, lastErrorAt: null },
      })
    await db
      .insert(alertSettings)
      .values({ userId: user.id, pushEnabled: true })
      .onConflictDoUpdate({ target: alertSettings.userId, set: { pushEnabled: true, updatedAt: new Date() } })
    return NextResponse.json({ ok: true }, { status: 201, headers: noStore })
  } catch (err) {
    console.error('[api/push/subscribe] POST failed', err)
    return errors.server()
  }
}

const deleteSchema = z.object({ endpoint: endpointSchema })

// DELETE /api/push/subscribe — forget this browser's subscription.
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  const limited = limit(request, 'push-subscribe', 10, 60_000, user.id)
  if (limited) return limited
  const body = await parseBody(request, deleteSchema)
  if (!body.ok) return body.response
  try {
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, body.data.endpoint)))
    return NextResponse.json({ ok: true }, { headers: noStore })
  } catch (err) {
    console.error('[api/push/subscribe] DELETE failed', err)
    return errors.server()
  }
}
