import { NextResponse } from 'next/server'
import { getSessionUser } from '@/app/club/_lib/api'
import { getPersonalPicks } from '@/lib/recommendations'

/** GET /api/me/picks — "Pour toi" for the logged-in member (keeps the homepage cacheable). */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return new NextResponse(null, { status: 204 })
  try {
    const picks = await getPersonalPicks({ userId: user.id, when: 'week', limit: 8 })
    if (!picks.plan.personalized || picks.events.length < 3) return new NextResponse(null, { status: 204 })
    return NextResponse.json({ events: picks.events }, { headers: { 'Cache-Control': 'private, max-age=300' } })
  } catch (err) {
    console.error('[api/me/picks]', err)
    return new NextResponse(null, { status: 204 })
  }
}
