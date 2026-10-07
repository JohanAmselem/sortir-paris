import 'server-only'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db, events, venues } from '@sortir/db'
import { and, desc, eq, sql } from 'drizzle-orm'
import { bucketNow, liveCondition, withTimeout } from './events/query'

export interface VenueSummary {
  slug: string
  name: string
  arrondissement: string | null
  address: string | null
  upcoming: number
}

/** Venues with at least one live event, most active first. */
export const listActiveVenues = unstable_cache(
  async (nowMs: number, limit: number): Promise<VenueSummary[]> => {
    const rows = await db
      .select({
        slug: venues.slug,
        name: venues.name,
        arrondissement: venues.arrondissement,
        address: venues.address,
        upcoming: sql<number>`count(*)`,
      })
      .from(events)
      .innerJoin(venues, eq(events.venueId, venues.id))
      .where(and(liveCondition(new Date(nowMs)), sql`${venues.canonicalVenueId} is null`))
      .groupBy(venues.id)
      .orderBy(desc(sql`count(*)`), venues.name)
      .limit(limit)
    return rows.map((r) => ({ ...r, upcoming: Number(r.upcoming) }))
  },
  ['active-venues-v1'],
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

const loadVenue = unstable_cache(
  async (slug: string): Promise<VenueDetail | null> => {
    const rows = await db.select().from(venues).where(eq(venues.slug, slug)).limit(1)
    const v = rows[0]
    if (!v) return null
    let canonicalSlug: string | null = null
    if (v.canonicalVenueId) {
      const c = await db.select({ slug: venues.slug }).from(venues).where(eq(venues.id, v.canonicalVenueId)).limit(1)
      canonicalSlug = c[0]?.slug ?? null
    }
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

export const getVenueBySlug = cache((slug: string) => withTimeout(loadVenue(slug), 8000, 'getVenueBySlug'))

export const getActiveVenues = (limit = 200) => withTimeout(listActiveVenues(bucketNow().getTime(), limit), 8000, 'listActiveVenues')
