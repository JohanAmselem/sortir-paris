/** Intent → event query. Pure (no database), shared by the search page and /api/discover. */
import { extractSearchFilters } from '@/lib/events/search-synonyms'
import type { EventQuery } from '@/lib/events/types'
import type { OutingIntent } from './intent-rules'

export function intentToQuery(i: OutingIntent, near?: { lat: number; lng: number } | null): EventQuery {
  // Keywords such as "stand up" are topics, not text ("up" would be dropped).
  const found = i.keywords.length ? extractSearchFilters(i.keywords.join(' ')) : null
  return {
    when: i.date ?? i.when ?? 'week',
    categories: [...new Set([...i.categories, ...(found?.categories ?? [])])],
    arrondissements: i.arrondissements,
    free: i.free || Boolean(found?.free),
    maxPrice: i.free ? null : i.maxPrice,
    intents: [...new Set([...i.intents, ...(found?.intents ?? [])])],
    topics: found?.topics ?? [],
    q: found?.q ?? null,
    near: i.nearMe && near ? { ...near, radiusKm: 2.5 } : null,
  }
}
