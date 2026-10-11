import { NextRequest, NextResponse } from 'next/server'
import { suggestArtists } from '@/app/club/_lib/artists'
import { clientIp, rateLimit } from '@/lib/rate-limit'

/**
 * GET /api/artists/suggest?q= — up to 8 artists playing in Paris soon whose
 * name starts with (or has a word starting with) the query. Cached per query.
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').slice(0, 120)
  if (q.trim().length < 2) return NextResponse.json({ artists: [] })

  const limit = rateLimit(`artist-suggest:${clientIp(request.headers)}`, 40, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ artists: [] }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
  }
  try {
    const artists = await suggestArtists(q)
    return NextResponse.json({ artists }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' } })
  } catch (err) {
    console.error('[api/artists/suggest]', err)
    // A convenience: never an error for the person typing.
    return NextResponse.json({ artists: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
