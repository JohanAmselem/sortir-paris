import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { events, venues, categories, withStatementTimeout } from '@sortir/db'
import { and, eq, sql } from 'drizzle-orm'
import { STATEMENT_TIMEOUT_MS, bucketNow, buildConditions, withTimeout } from '@/lib/events/query'

// One aggregate over the whole window (~7 s cold): cached 5 min + CDN, refreshed in
// the background, so it gets more time than listings — a refresh that always hit the
// listing limit would leave the map stale forever.
const MAP_TIMEOUT_MS = STATEMENT_TIMEOUT_MS * 2
import { parseEventParams } from '@/lib/events/params'
import type { EventQuery } from '@/lib/events/types'

/**
 * GET /api/map — one GeoJSON point per VENUE (not per event): a few hundred
 * features instead of thousands, events at the same address are never stacked.
 * Properties are kept tiny; details are fetched on selection via /api/events?venue=.
 */
const load = unstable_cache(
  async (query: EventQuery) => {
    const { where } = buildConditions(query, bucketNow())
    const rows = await withStatementTimeout(MAP_TIMEOUT_MS, (tx) => tx
      .select({
        slug: venues.slug,
        name: venues.name,
        arr: venues.arrondissement,
        lat: venues.lat,
        lng: venues.lng,
        n: sql<number>`count(*)`,
        free: sql<number>`count(*) filter (where ${events.priceStatus} = 'free')`,
        cat: sql<string>`mode() within group (order by ${categories.slug})`,
        top: sql<string>`(array_agg(${events.title} order by ${events.qualityScore} desc, ${events.startDate}))[1]`,
      })
      .from(events)
      .innerJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(where, sql`${venues.lat} is not null`, sql`${venues.lng} is not null`))
      .groupBy(venues.id)
      .limit(3000))

    return {
      type: 'FeatureCollection' as const,
      features: rows.map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [Number(r.lng), Number(r.lat)] },
        properties: {
          slug: r.slug,
          name: r.name,
          arr: r.arr,
          n: Number(r.n),
          free: Number(r.free),
          cat: r.cat ?? 'autre',
          top: r.top,
        },
      })),
    }
  },
  ['map-venues-v2'],
  { revalidate: 300, tags: ['events'] }
)

export async function GET(req: NextRequest) {
  const query = parseEventParams(req.nextUrl.searchParams)
  // The map shows everything in the window; geolocation only recentres it.
  query.near = null
  query.q = null
  if (!query.when) query.when = 'week'
  try {
    const data = await withTimeout(load(query), MAP_TIMEOUT_MS + 1500, 'map')
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } })
  } catch (err) {
    console.error('[api/map]', err)
    return NextResponse.json({ error: 'Carte indisponible' }, { status: 503 })
  }
}
