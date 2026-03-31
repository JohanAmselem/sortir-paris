import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db, users } from '@sortir/db'
import { eq } from 'drizzle-orm'

// POST /api/auth/onboarded — Mark user as onboarded
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await db
    .update(users)
    .set({ onboarded: true, updatedAt: new Date() })
    .where(eq(users.id, user.id))

  return NextResponse.json({ success: true })
}
