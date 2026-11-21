import { NextResponse, type NextRequest } from 'next/server'
import { getVenueBySlug } from '@/lib/venues'
import { safeQueryEvents } from '@/lib/events/query'
import { absoluteUrl } from '@/lib/site'
import type { VenueResponse } from '@/lib/api-v1/contract'

/** GET /api/v1/venues/[slug] — fiche lieu : adresse et prochaines sorties (comme /lieux/[slug]). */
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!/^[^/\s]{1,300}$/.test(slug)) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 })
  try {
    const venue = await getVenueBySlug(slug)
    if (!venue) return NextResponse.json({ error: 'Ce lieu n’existe plus.' }, { status: 404 })
    if (venue.canonicalSlug && venue.canonicalSlug !== slug) {
      return NextResponse.json({ redirect: venue.canonicalSlug }, { status: 308 })
    }
    const page = await safeQueryEvents({ venueSlug: slug, sort: 'soon', limit: 40 })
    const body = {
      venue: {
        id: venue.id,
        slug: venue.slug,
        name: venue.name,
        address: venue.address,
        city: venue.city,
        zipCode: venue.zipCode,
        arrondissement: venue.arrondissement,
        lat: venue.lat,
        lng: venue.lng,
        website: venue.website,
        imageUrl: venue.imageUrl,
      },
      events: page.events,
      total: page.total,
      webUrl: absoluteUrl(`/lieux/${venue.slug}`),
    } satisfies VenueResponse
    return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } })
  } catch (err) {
    console.error('[api/v1/venues/slug]', err)
    return NextResponse.json({ error: 'Impossible de charger ce lieu.' }, { status: 503 })
  }
}
