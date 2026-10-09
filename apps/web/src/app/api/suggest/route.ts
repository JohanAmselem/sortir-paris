import { NextRequest, NextResponse } from 'next/server'
import { EMPTY_SUGGESTIONS, getSuggestions } from '@/lib/events/suggest'
import { clientIp, rateLimit } from '@/lib/rate-limit'

/**
 * GET /api/suggest?q= — instant suggestions under the search box: up to 5 venues,
 * matching categories and 5 event titles. Cached per normalised query.
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').slice(0, 80)
  if (q.trim().length < 2) return NextResponse.json(EMPTY_SUGGESTIONS)

  const limit = rateLimit(`suggest:${clientIp(request.headers)}`, 40, 60_000)
  if (!limit.ok) {
    return NextResponse.json(EMPTY_SUGGESTIONS, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
  }

  try {
    const data = await getSuggestions(q)
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' } })
  } catch (err) {
    console.error('[api/suggest]', err)
    // Suggestions are a convenience: never an error for the person typing.
    return NextResponse.json(EMPTY_SUGGESTIONS, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }
}
