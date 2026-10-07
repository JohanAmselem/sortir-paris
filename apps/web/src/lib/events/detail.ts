import 'server-only'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db, events, venues, categories } from '@sortir/db'
import { eq } from 'drizzle-orm'
import { withTimeout } from './query'

export interface EventDetail {
  id: string
  slug: string
  title: string
  description: string | null
  shortDesc: string | null
  imageUrl: string | null
  startDate: string
  endDate: string | null
  timeKnown: boolean
  priceMin: number
  priceMax: number
  priceStatus: 'free' | 'paid' | 'unknown'
  isFree: boolean
  bookingUrl: string | null
  source: string
  sourceUrl: string | null
  status: string
  canonicalSlug: string | null
  saveCount: number
  attendanceCount: number
  updatedAt: string
  category: { slug: string; name: string; icon: string | null } | null
  venue: {
    id: string
    name: string
    slug: string
    address: string | null
    city: string
    zipCode: string | null
    arrondissement: string | null
    lat: number | null
    lng: number | null
    website: string | null
  } | null
}

const iso = (d: Date | string | null) => (d == null ? null : d instanceof Date ? d.toISOString() : String(d))

async function load(slug: string): Promise<EventDetail | null> {
  const rows = await db
    .select({ event: events, venue: venues, category: categories })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(eq(events.slug, slug))
    .limit(1)
  if (!rows.length) return null
  const { event: e, venue: v, category: c } = rows[0]

  let canonicalSlug: string | null = null
  if (e.canonicalEventId) {
    const canon = await db.select({ slug: events.slug }).from(events).where(eq(events.id, e.canonicalEventId)).limit(1)
    canonicalSlug = canon[0]?.slug ?? null
  }

  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    description: e.description,
    shortDesc: e.shortDesc,
    imageUrl: e.imageUrl,
    startDate: iso(e.startDate)!,
    endDate: iso(e.endDate),
    timeKnown: e.timeKnown,
    priceMin: e.priceMin,
    priceMax: e.priceMax,
    priceStatus: e.priceStatus,
    isFree: e.isFree,
    bookingUrl: e.bookingUrl,
    source: e.source,
    sourceUrl: e.sourceUrl,
    status: e.status,
    canonicalSlug,
    saveCount: e.saveCount,
    attendanceCount: e.attendanceCount,
    updatedAt: iso(e.updatedAt)!,
    category: c ? { slug: c.slug, name: c.name, icon: c.icon } : null,
    venue: v
      ? {
          id: v.id,
          name: v.name,
          slug: v.slug,
          address: v.address,
          city: v.city,
          zipCode: v.zipCode,
          arrondissement: v.arrondissement,
          lat: v.lat == null ? null : Number(v.lat),
          lng: v.lng == null ? null : Number(v.lng),
          website: v.website,
        }
      : null,
  }
}

const cached = unstable_cache(load, ['event-detail-v1'], { revalidate: 600, tags: ['events'] })

/** Deduplicated within a request (metadata + page) and cached 10 min across requests. */
export const getEventBySlug = cache((slug: string) => withTimeout(cached(slug), 8000, 'getEventBySlug'))
