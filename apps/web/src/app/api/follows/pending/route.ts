import { NextRequest, NextResponse } from 'next/server'
import { errors, getSessionUser, limit } from '@/app/club/_lib/api'
import { applyActivatedCookies, consumePendingFollow } from '@/lib/follow-server'
import { PENDING_FOLLOW_COOKIE } from '@/lib/pending-follow'

export const dynamic = 'force-dynamic'

/**
 * POST /api/follows/pending — fallback of the « Alertes concerts » funnel: the
 * destination page (?activated=1) calls it when the pending-follow cookie is
 * still there (the auth callback normally consumes it). Returns the outcome.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  const limited = limit(request, 'follows-pending', 10, 60_000, user.id)
  if (limited) return limited
  const raw = request.cookies.get(PENDING_FOLLOW_COOKIE)?.value
  const result = raw ? await consumePendingFollow(user, raw) : null
  const res = NextResponse.json({ result }, { headers: { 'Cache-Control': 'private, no-store' } })
  // The banner gets the result in the body: only clear the pending cookie here.
  applyActivatedCookies(res, null, Boolean(raw))
  return res
}
