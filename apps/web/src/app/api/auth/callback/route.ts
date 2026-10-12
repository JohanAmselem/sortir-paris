import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, users } from '@sortir/db'
import { createClient } from '@/lib/supabase/server'
import { ensureUserRow } from '@/app/club/_lib/api'
import { safeNext } from '@/app/club/_lib/safe-next'
import { applyActivatedCookies, consumePendingFollow } from '@/lib/follow-server'
import { PENDING_FOLLOW_COOKIE } from '@/lib/pending-follow'

export const dynamic = 'force-dynamic'

// GET /api/auth/callback — OAuth / magic link callback.
export async function GET(request: NextRequest) {
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
    // « Alertes concerts »: the follow asked for before logging in (Google and magic link both land here).
    const pending = request.cookies.get(PENDING_FOLLOW_COOKIE)?.value
    const activated = pending ? await consumePendingFollow(user, pending) : null

    const [row] = await db.select({ onboarded: users.onboarded }).from(users).where(eq(users.id, user.id)).limit(1)
    const res = row && !row.onboarded ? to(`/onboarding?next=${encodeURIComponent(next)}`) : to(next)
    applyActivatedCookies(res, activated, Boolean(pending))
    return res
  } catch (err) {
    console.error('[auth/callback] failed', err)
    return to('/login?error=auth')
  }
}
