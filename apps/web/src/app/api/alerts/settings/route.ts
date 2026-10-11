import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { alertSettings, db } from '@sortir/db'
import { ensureUserRow, errors, getSessionUser, limit, parseBody } from '@/app/club/_lib/api'
import { getAlertSettings } from '@/app/club/_lib/artists'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

// GET /api/alerts/settings — the member's alert settings (defaults without a row).
export async function GET() {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  try {
    return NextResponse.json({ settings: await getAlertSettings(user.id) }, { headers: noStore })
  } catch (err) {
    console.error('[api/alerts/settings] GET failed', err)
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
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Rien à modifier.' })

// PATCH /api/alerts/settings — change some settings (row created on first change).
export async function PATCH(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  const limited = limit(request, 'alert-settings', 30, 60_000, user.id)
  if (limited) return limited
  const body = await parseBody(request, patchSchema)
  if (!body.ok) return body.response
  try {
    await ensureUserRow(user)
    const changes = { ...body.data, updatedAt: new Date() }
    const [row] = await db
      .insert(alertSettings)
      .values({ userId: user.id, ...body.data })
      .onConflictDoUpdate({ target: alertSettings.userId, set: changes })
      .returning({
        emailEnabled: alertSettings.emailEnabled,
        pushEnabled: alertSettings.pushEnabled,
        notifyNewDate: alertSettings.notifyNewDate,
        notifyOnSale: alertSettings.notifyOnSale,
        notifyReminder: alertSettings.notifyReminder,
      })
    return NextResponse.json({ settings: row }, { headers: noStore })
  } catch (err) {
    console.error('[api/alerts/settings] PATCH failed', err)
    return errors.server()
  }
}
