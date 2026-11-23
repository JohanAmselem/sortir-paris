import { NextRequest, NextResponse } from 'next/server'
import { HOME_WHENS, getHomeV2 } from '@/lib/home-v2'
import type { HomeV2Response, HomeWhen } from '@/lib/api-v2/contract'

/**
 * GET /api/v2/home?when=tonight|tomorrow|weekend[&lat&lng] — l'accueil refondu :
 * notre choix (avec sa raison), par envie, ce week-end, les grosses dates, les expos.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const when = (HOME_WHENS as string[]).includes(sp.get('when') ?? '') ? (sp.get('when') as HomeWhen) : 'tonight'
  const lat = Number(sp.get('lat'))
  const lng = Number(sp.get('lng'))
  const near = Number.isFinite(lat) && Number.isFinite(lng) && lat > 48.5 && lat < 49.2 && lng > 1.9 && lng < 2.9 ? { lat, lng } : null
  try {
    const body = (await getHomeV2(when, near)) satisfies HomeV2Response
    return NextResponse.json(body, {
      headers: near ? { 'Cache-Control': 'private, max-age=60' } : { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' },
    })
  } catch (err) {
    console.error('[api/v2/home]', err)
    return NextResponse.json({ error: 'Impossible de charger l’accueil.' }, { status: 503 })
  }
}
