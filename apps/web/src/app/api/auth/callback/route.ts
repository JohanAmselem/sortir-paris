import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, users } from '@sortir/db'
import { createClient } from '@/lib/supabase/server'
import { ensureUserRow } from '@/app/club/_lib/api'
import { safeNext } from '@/app/club/_lib/safe-next'

export const dynamic = 'force-dynamic'

// GET /api/auth/callback — OAuth / magic link callback.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Only same-site paths: never `${origin}${next}` with next=@evil.com or //evil.com.
  const next = safeNext(searchParams.get('next'))
  const to = (path: string) => NextResponse.redirect(new URL(path, origin))

  if (!code) return to('/login?error=auth')

  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return to(`/login?error=auth&next=${encodeURIComponent(next)}`)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return to(`/login?error=auth&next=${encodeURIComponent(next)}`)

    await ensureUserRow(user)
    const [row] = await db.select({ onboarded: users.onboarded }).from(users).where(eq(users.id, user.id)).limit(1)
    if (row && !row.onboarded) return to(`/onboarding?next=${encodeURIComponent(next)}`)
    return to(next)
  } catch (err) {
    console.error('[auth/callback] failed', err)
    return to('/login?error=auth')
  }
}
