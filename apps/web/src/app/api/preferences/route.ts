import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, userPreferences, users } from '@sortir/db'
import { ARRONDISSEMENTS, CATEGORY_BY_SLUG, INTENT_BY_SLUG } from '@/lib/events/taxonomy'
import { ensureUserRow, errors, getSessionUser, limit, parseBody } from '@/app/club/_lib/api'

export const dynamic = 'force-dynamic'

const slugList = (valid: (s: string) => boolean, max: number, label: string) =>
  z
    .array(z.string().max(40))
    .max(max)
    .default([])
    .refine((list) => list.every(valid), { message: `${label} inconnue dans la sélection.` })
    .transform((list) => [...new Set(list)])

const bodySchema = z.object({
  categories: slugList((s) => s in CATEGORY_BY_SLUG, 10, 'Catégorie'),
  ambiances: slugList((s) => s in INTENT_BY_SLUG, 8, 'Ambiance'),
  zones: slugList((s) => ARRONDISSEMENTS.includes(s), 20, 'Zone'),
  prefFree: z.boolean().default(false),
  /** Also mark onboarding as done (one request instead of two). */
  onboarded: z.boolean().optional(),
})

// GET /api/preferences
export async function GET() {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  try {
    const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, user.id)).limit(1)
    return NextResponse.json(
      prefs
        ? { categories: prefs.categories, ambiances: prefs.ambiances, zones: prefs.zones, prefFree: prefs.prefFree }
        : null,
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (err) {
    console.error('[api/preferences] GET failed', err)
    return errors.server()
  }
}

// PUT /api/preferences — onboarding + settings. Stores slugs (text[]).
export async function PUT(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  const limited = limit(request, 'preferences', 20, 60_000, user.id)
  if (limited) return limited
  const body = await parseBody(request, bodySchema)
  if (!body.ok) return body.response
  const { categories, ambiances, zones, prefFree, onboarded } = body.data

  try {
    await ensureUserRow(user)
    const values = { categories, ambiances, zones, prefFree }
    await db
      .insert(userPreferences)
      .values({ userId: user.id, ...values })
      .onConflictDoUpdate({ target: userPreferences.userId, set: { ...values, updatedAt: new Date() } })
    if (onboarded) {
      await db.update(users).set({ onboarded: true, updatedAt: new Date() }).where(eq(users.id, user.id))
    }
    return NextResponse.json({ success: true, preferences: values })
  } catch (err) {
    console.error('[api/preferences] PUT failed', err)
    return errors.server()
  }
}
