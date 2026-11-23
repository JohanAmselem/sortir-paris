import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { and, desc, eq, notInArray } from 'drizzle-orm'
import { alertSettings, db, pushSubscriptions } from '@sortir/db'
import { ensureUserRow, errors, getSessionUser, limit, parseBody } from '@/lib/member/api'
import { isExpoPushToken } from '@/lib/push-server'

/**
 * POST   /api/v1/push {token, platform, enable?} — l'appli inscrit le jeton Expo
 *        de l'appareil. `enable: true` seulement juste après l'accord du membre
 *        (geste « Activer les notifications ») : le push est alors activé. La
 *        réinscription silencieuse à chaque lancement ne touche jamais au réglage.
 * DELETE /api/v1/push {token} — l'appareil est oublié (déconnexion). Sans session :
 *        posséder le jeton suffit, pour qu'une déconnexion hors ligne puisse être
 *        rejouée plus tard et qu'un téléphone ne garde jamais les alertes d'un autre.
 */
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }
const MAX_DEVICES = 10

const tokenSchema = z.string().trim().refine(isExpoPushToken, { message: 'Jeton de notification invalide.' })
const postSchema = z.object({ token: tokenSchema, platform: z.enum(['ios', 'android']), enable: z.boolean().optional() })
const deleteSchema = z.object({ token: tokenSchema })

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  const limited = limit(request, 'v1-push', 20, 60_000, user.id)
  if (limited) return limited
  const body = await parseBody(request, postSchema)
  if (!body.ok) return body.response
  const { token, platform, enable } = body.data
  try {
    await ensureUserRow(user)
    const now = new Date()
    // Un appareil peut changer de compte : le jeton suit le dernier membre connecté.
    await db
      .insert(pushSubscriptions)
      .values({ userId: user.id, endpoint: token, kind: 'expo', platform, p256dh: null, auth: null, lastSeenAt: now })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: user.id, kind: 'expo', platform, p256dh: null, auth: null, lastSeenAt: now, lastErrorAt: null },
      })
    // Au plus MAX_DEVICES appareils (appli) par membre : on garde les plus récents.
    const keep = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.kind, 'expo')))
      .orderBy(desc(pushSubscriptions.lastSeenAt))
      .limit(MAX_DEVICES)
    if (keep.length === MAX_DEVICES) {
      await db.delete(pushSubscriptions).where(
        and(
          eq(pushSubscriptions.userId, user.id),
          eq(pushSubscriptions.kind, 'expo'),
          notInArray(
            pushSubscriptions.id,
            keep.map((k) => k.id)
          )
        )
      )
    }
    if (enable) {
      await db
        .insert(alertSettings)
        .values({ userId: user.id, pushEnabled: true })
        .onConflictDoUpdate({ target: alertSettings.userId, set: { pushEnabled: true, updatedAt: now } })
    }
    return NextResponse.json({ ok: true }, { status: 201, headers: noStore })
  } catch (err) {
    console.error('[api/v1/push] POST failed', err)
    return errors.server()
  }
}

export async function DELETE(request: NextRequest) {
  const limited = limit(request, 'v1-push-delete', 20, 60_000)
  if (limited) return limited
  const body = await parseBody(request, deleteSchema)
  if (!body.ok) return body.response
  try {
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.kind, 'expo'), eq(pushSubscriptions.endpoint, body.data.token)))
    return NextResponse.json({ ok: true }, { headers: noStore })
  } catch (err) {
    console.error('[api/v1/push] DELETE failed', err)
    return errors.server()
  }
}
