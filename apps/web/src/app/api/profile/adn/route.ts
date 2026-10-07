import { NextResponse } from 'next/server'
import { getXpProgress } from '@/lib/gamification'
import { errors, getSessionUser } from '@/app/club/_lib/api'
import { getMemberOverview, getTasteDna } from '@/app/club/_lib/member'

export const dynamic = 'force-dynamic'

// GET /api/profile/adn — the member's cultural DNA (the /compte/adn page renders it server-side).
export async function GET() {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  try {
    const [overview, dna] = await Promise.all([getMemberOverview(user.id), getTasteDna(user.id)])
    if (!overview) return errors.server()
    const xp = getXpProgress(overview.xp)
    return NextResponse.json(
      {
        ...dna,
        stats: overview.stats,
        xp: overview.xp,
        level: xp.current,
        nextLevel: xp.next,
        xpProgress: xp.progress,
        badges: overview.badges,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (err) {
    console.error('[api/profile/adn] failed', err)
    return errors.server()
  }
}
