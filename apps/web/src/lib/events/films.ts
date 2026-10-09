import 'server-only'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { events, venues, categories, withStatementTimeout } from '@sortir/db'
import { and, asc, eq } from 'drizzle-orm'
import { STATEMENT_TIMEOUT_MS, bucketNow, filmKeySql, liveCondition, toCard, withTimeout } from './query'
import type { CardEvent } from './types'

const SEANCES_LIMIT = 300

/**
 * All upcoming séances of a film (cinema category, same film key), soonest first.
 * Only cinema rows are scanned (a few thousand), with the usual server-side limit.
 */
async function loadFilm(slug: string): Promise<CardEvent[]> {
  const now = bucketNow()
  const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
    tx
      .select({
        id: events.id,
        slug: events.slug,
        title: events.title,
        shortDesc: events.shortDesc,
        imageUrl: events.imageUrl,
        startDate: events.startDate,
        endDate: events.endDate,
        timeKnown: events.timeKnown,
        priceMin: events.priceMin,
        priceMax: events.priceMax,
        priceStatus: events.priceStatus,
        isFree: events.isFree,
        saveCount: events.saveCount,
        qualityScore: events.qualityScore,
        categorySlug: categories.slug,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        venueName: venues.name,
        venueSlug: venues.slug,
        venueArr: venues.arrondissement,
        venueCity: venues.city,
        venueZip: venues.zipCode,
        venueLat: venues.lat,
        venueLng: venues.lng,
      })
      .from(events)
      .innerJoin(categories, eq(events.categoryId, categories.id))
      .leftJoin(venues, eq(events.venueId, venues.id))
      .where(and(liveCondition(now), eq(categories.slug, 'cinema'), eq(filmKeySql, slug)))
      .orderBy(asc(events.startDate), asc(events.id))
      .limit(SEANCES_LIMIT)
  )
  return rows.map(toCard)
}

const cached = unstable_cache(loadFilm, ['film-seances-v1'], { revalidate: 600, tags: ['events'] })

/** Deduplicated within a request (metadata + page), cached 10 min. */
export const getFilmSeances = cache((slug: string) => withTimeout(cached(slug), STATEMENT_TIMEOUT_MS + 1500, 'getFilmSeances'))
