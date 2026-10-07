import { NextRequest, NextResponse } from 'next/server'
import { queryEvents } from '@/lib/events/query'
import { parseEventParams } from '@/lib/events/params'

/**
 * GET /api/events — paginated listing used by "Charger plus".
 * Same URL scheme as the pages (see lib/events/params.ts) + offset/limit.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const query = parseEventParams(sp)
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 24, 1), 48)
  const offset = Math.min(Math.max(Number(sp.get('offset')) || 0, 0), 2000)
  // Locked filters from the page (e.g. /categories/expos) are passed as regular params.
  if (sp.get('venue')) query.venueSlug = sp.get('venue')

  try {
    const page = await queryEvents({ ...query, limit, offset })
    return NextResponse.json(page, {
      headers: query.near
        ? { 'Cache-Control': 'private, max-age=60' }
        : { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' },
    })
  } catch (err) {
    console.error('[api/events]', err)
    return NextResponse.json({ error: 'Impossible de charger les événements.' }, { status: 503 })
  }
}
