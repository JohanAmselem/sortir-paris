import 'server-only'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { events, venues, categories, withStatementTimeout } from '@sortir/db'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { STATEMENT_TIMEOUT_MS, bucketNow, liveCondition, withTimeout, workMatchSql } from './query'
import { WORK_CATEGORIES, WORK_SLUG_RE, isGenericWorkSlug, type WorkDate } from './works-utils'
import { isSignatureVenue } from '@/lib/venues-signature'

/** Hard cap on the dates of one work (a long run published day by day). */
export const WORK_DATES_LIMIT = 300

export interface WorkRow extends WorkDate {
  title: string
  description: string | null
  shortDesc: string | null
  imageUrl: string | null
  qualityScore: number
  category: { slug: string; name: string } | null
  venue: {
    name: string
    slug: string
    address: string | null
    zipCode: string | null
    city: string | null
    arrondissement: string | null
    lat: number | null
    lng: number | null
    signature: boolean
  } | null
}

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? String(d) : null)

/**
 * All live dates of a work (theatre, shows, dance, concerts, exhibitions),
 * soonest first. Index-driven: trigram LIKE on the live rows, then the exact
 * title key; 6 s server-side limit, 300 rows max.
 */
async function loadWork(slug: string): Promise<WorkRow[]> {
  if (!WORK_SLUG_RE.test(slug) || slug.length > 160 || isGenericWorkSlug(slug)) return []
  const now = bucketNow()
  const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
    tx
      .select({
        id: events.id,
        slug: events.slug,
        title: events.title,
        description: events.description,
        shortDesc: events.shortDesc,
        imageUrl: events.imageUrl,
        startDate: events.startDate,
        endDate: events.endDate,
        timeKnown: events.timeKnown,
        priceMin: events.priceMin,
        priceMax: events.priceMax,
        priceStatus: events.priceStatus,
        isFree: events.isFree,
        bookingUrl: events.bookingUrl,
        sourceUrl: events.sourceUrl,
        source: events.source,
        qualityScore: events.qualityScore,
        categorySlug: categories.slug,
        categoryName: categories.name,
        venueName: venues.name,
        venueSlug: venues.slug,
        venueAddress: venues.address,
        venueZip: venues.zipCode,
        venueCity: venues.city,
        venueArr: venues.arrondissement,
        venueLat: venues.lat,
        venueLng: venues.lng,
      })
      .from(events)
      .innerJoin(categories, eq(events.categoryId, categories.id))
      .leftJoin(venues, eq(events.venueId, venues.id))
      .where(
        and(
          liveCondition(now),
          inArray(categories.slug, [...WORK_CATEGORIES]),
          workMatchSql(slug)
        )
      )
      .orderBy(asc(events.startDate), asc(events.id))
      .limit(WORK_DATES_LIMIT)
  )
  return rows.map((r) => ({
    id: String(r.id),
    slug: r.slug,
    title: r.title,
    description: r.description,
    shortDesc: r.shortDesc,
    imageUrl: r.imageUrl,
    startDate: iso(r.startDate)!,
    endDate: iso(r.endDate),
    timeKnown: r.timeKnown !== false,
    priceMin: Number(r.priceMin ?? 0),
    priceMax: Number(r.priceMax ?? 0),
    priceStatus: r.priceStatus,
    isFree: Boolean(r.isFree),
    bookingUrl: r.bookingUrl,
    sourceUrl: r.sourceUrl,
    source: r.source,
    qualityScore: Number(r.qualityScore ?? 0),
    category: r.categorySlug ? { slug: r.categorySlug, name: r.categoryName } : null,
    venue: r.venueSlug
      ? {
          name: String(r.venueName),
          slug: r.venueSlug,
          address: r.venueAddress ?? null,
          zipCode: r.venueZip ?? null,
          city: r.venueCity ?? null,
          arrondissement: r.venueArr ?? null,
          lat: r.venueLat == null ? null : Number(r.venueLat),
          lng: r.venueLng == null ? null : Number(r.venueLng),
          signature: isSignatureVenue(r.venueName),
        }
      : null,
  }))
}

// Keyed by slug only (no time in the key); refreshed every 10 min.
const cached = unstable_cache(loadWork, ['work-dates-v1'], { revalidate: 600, tags: ['events'] })

/** Deduplicated within a request (metadata + page), cached 10 min. */
export const getWorkDates = cache((slug: string) => withTimeout(cached(slug), STATEMENT_TIMEOUT_MS + 1500, 'getWorkDates'))

/** Never throws (event pages): an empty list on error. */
export async function safeGetWorkDates(slug: string): Promise<WorkRow[]> {
  try {
    return await getWorkDates(slug)
  } catch (err) {
    console.error('[works] query failed', err)
    return []
  }
}
