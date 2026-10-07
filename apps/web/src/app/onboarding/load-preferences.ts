import 'server-only'
import { eq } from 'drizzle-orm'
import { db, userPreferences } from '@sortir/db'
import type { Preferences } from './preferences-form'

export async function loadPreferences(userId: string): Promise<Preferences> {
  try {
    const [p] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1)
    if (p) return { categories: p.categories, ambiances: p.ambiances, zones: p.zones, prefFree: p.prefFree }
  } catch (err) {
    console.error('[onboarding] preferences failed', err)
  }
  return { categories: [], ambiances: [], zones: [], prefFree: false }
}
