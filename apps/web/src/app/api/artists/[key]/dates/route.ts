import { NextRequest, NextResponse } from 'next/server'
import { getUpcomingArtistDates } from '@/app/club/_lib/artists'
import { artistKey, isValidArtistKey } from '@/lib/artists'
import { clientIp, rateLimit } from '@/lib/rate-limit'

/**
 * GET /api/artists/[key]/dates — the next Paris dates (at most 10) of an
 * artist, for the « Alertes concerts » demo. Public, cached per artist key.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key: raw } = await params
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {}
  const key = artistKey(decoded.slice(0, 120))
  if (!isValidArtistKey(key)) return NextResponse.json({ dates: [] }, { status: 400 })

  const limited = rateLimit(`artist-dates:${clientIp(request.headers)}`, 40, 60_000)
  if (!limited.ok) {
    return NextResponse.json({ dates: [] }, { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } })
  }
  try {
    const dates = (await getUpcomingArtistDates(key)).map(({ slug, title, startDate, timeKnown, venueName }) => ({ slug, title, startDate, timeKnown, venueName }))
    return NextResponse.json({ dates }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' } })
  } catch (err) {
    console.error('[api/artists/dates]', err)
    return NextResponse.json({ dates: [], error: true }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
