import 'server-only'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { events, venues, withStatementTimeout } from '@sortir/db'
import { and, desc, eq, sql } from 'drizzle-orm'
import { STATEMENT_TIMEOUT_MS, bucketNow, liveCondition, withTimeout } from './events/query'

export interface VenueSummary {
  slug: string
  name: string
  arrondissement: string | null
  address: string | null
  upcoming: number
}

/** Venues with at least one live event, most active first. */
export const listActiveVenues = unstable_cache(
  async (limit: number): Promise<VenueSummary[]> => {
    const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) => tx
      .select({
        slug: venues.slug,
        name: venues.name,
        arrondissement: venues.arrondissement,
        address: venues.address,
        upcoming: sql<number>`count(*)`,
      })
      .from(events)
      .innerJoin(venues, eq(events.venueId, venues.id))
      .where(and(liveCondition(bucketNow()), sql`${venues.canonicalVenueId} is null`))
      .groupBy(venues.id)
      .orderBy(desc(sql`count(*)`), venues.name)
      .limit(limit))
    return rows.map((r) => ({ ...r, upcoming: Number(r.upcoming) }))
  },
  ['active-venues-v3'],
  { revalidate: 3600, tags: ['events'] }
)

export interface VenueDetail {
  id: string
  slug: string
  name: string
  address: string | null
  city: string
  zipCode: string | null
  arrondissement: string | null
  lat: number | null
  lng: number | null
  website: string | null
  imageUrl: string | null
  canonicalSlug: string | null
}

/** Thrown (never cached) when a slug is unknown: see getVenueBySlug. */
class VenueNotFound extends Error {}

const loadVenue = unstable_cache(
  async (slug: string): Promise<VenueDetail> => {
    const { v, canonicalSlug } = await withStatementTimeout(STATEMENT_TIMEOUT_MS, async (tx) => {
      const rows = await tx.select().from(venues).where(eq(venues.slug, slug)).limit(1)
      const v = rows[0]
      if (!v) return { v: null, canonicalSlug: null }
      let canonicalSlug: string | null = null
      if (v.canonicalVenueId) {
        const c = await tx.select({ slug: venues.slug }).from(venues).where(eq(venues.id, v.canonicalVenueId)).limit(1)
        canonicalSlug = c[0]?.slug ?? null
      }
      return { v, canonicalSlug }
    })
    // A "not found" must not be cached for an hour: venues are created by the
    // scrapers all day long and the /lieux list (cached separately) links to
    // them as soon as they have events (lucernaire, reflet-medicis returned 404).
    if (!v) throw new VenueNotFound(slug)
    return {
      id: v.id,
      slug: v.slug,
      name: v.name,
      address: v.address,
      city: v.city,
      zipCode: v.zipCode,
      arrondissement: v.arrondissement,
      lat: v.lat == null ? null : Number(v.lat),
      lng: v.lng == null ? null : Number(v.lng),
      website: v.website,
      imageUrl: v.imageUrl,
      canonicalSlug,
    }
  },
  ['venue-detail-v1'],
  { revalidate: 3600, tags: ['venues'] }
)

export const getVenueBySlug = cache(async (slug: string): Promise<VenueDetail | null> => {
  try {
    return await withTimeout(loadVenue(slug), 8000, 'getVenueBySlug')
  } catch (err) {
    if (err instanceof VenueNotFound || (err instanceof Error && err.constructor.name === 'VenueNotFound')) return null
    throw err
  }
})

export const getActiveVenues = (limit = 2000) => withTimeout(listActiveVenues(limit), STATEMENT_TIMEOUT_MS + 1500, 'listActiveVenues')
