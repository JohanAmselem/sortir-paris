import { NextRequest, NextResponse } from 'next/server'
import { db, userPreferences } from '@sortir/db'
import { eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'

// GET /api/preferences
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const prefs = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, user.id))
    .limit(1)

  return NextResponse.json(prefs[0] ?? null)
}

// PUT /api/preferences — Update user preferences (onboarding + settings)
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { categories, zones, ambiances, prefFree } = body

  const result = await db
    .insert(userPreferences)
    .values({
      userId: user.id,
      categories: categories ?? [],
      zones: zones ?? [],
      ambiances: ambiances ?? [],
      prefFree: prefFree ?? false,
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        categories: categories ?? [],
        zones: zones ?? [],
        ambiances: ambiances ?? [],
        prefFree: prefFree ?? false,
        updatedAt: new Date(),
      },
    })
    .returning()

  return NextResponse.json(result[0])
}
