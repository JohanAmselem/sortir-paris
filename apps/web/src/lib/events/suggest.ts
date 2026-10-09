import 'server-only'
import { unstable_cache } from 'next/cache'
import { events, venues, categories, withStatementTimeout } from '@sortir/db'
import { and, asc, eq, sql } from 'drizzle-orm'
import { CATEGORIES } from './taxonomy'
import { filmSlug, foldText } from './fold'
import { STATEMENT_TIMEOUT_MS, bucketNow, liveCondition, textMatch, ts, withTimeout } from './query'

export interface Suggestions {
  venues: Array<{ name: string; slug: string; area: string | null }>
  categories: Array<{ label: string; href: string }>
  events: Array<{ title: string; href: string; venue: string | null }>
}

export const EMPTY_SUGGESTIONS: Suggestions = { venues: [], categories: [], events: [] }

/** Normalised query used as cache key: folded, single spaces, LIKE wildcards removed. */
export function normalizeSuggestQuery(q: string): string {
  return foldText(q)
    .replace(/[%_\\]/g, ' ')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

async function load(q: string): Promise<Suggestions> {
  const now = bucketNow()
  const pattern = `%${q}%`
  const foldName = sql`translate(lower(v.name), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy')`

  return withStatementTimeout(STATEMENT_TIMEOUT_MS, async (tx) => {
    // Venues by name (the table is small), only those with something coming up.
    const venueRows = await tx.execute<{ name: string; slug: string; arrondissement: string | null; city: string | null }>(sql`
      select v.name, v.slug, v.arrondissement, v.city
      from venues v
      where v.canonical_venue_id is null
        and ${foldName} like ${pattern}
        and exists (
          select 1 from events e
          where e.venue_id = v.id and e.status = 'active'
            and coalesce(e.end_date, e.start_date + interval '2 hours') >= ${ts(now)}
        )
      order by (${foldName} like ${`${q}%`}) desc, length(v.name), v.name
      limit 5`)

    // Event titles: same indexed text match as the listings, soonest first.
    const eventRows = await tx
      .select({ title: events.title, slug: events.slug, venue: venues.name, category: categories.slug })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(liveCondition(now), textMatch('like', pattern)))
      .orderBy(asc(events.startDate))
      .limit(15)

    const seen = new Set<string>()
    const eventList: Suggestions['events'] = []
    for (const r of eventRows) {
      const key = r.title.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const film = r.category === 'cinema'
      eventList.push({ title: r.title, href: film ? `/films/${filmSlug(r.title)}` : `/evenements/${r.slug}`, venue: film ? null : r.venue })
      if (eventList.length >= 5) break
    }

    const rows = Array.isArray(venueRows) ? venueRows : ((venueRows as { rows?: typeof venueRows }).rows ?? [])
    return {
      venues: (rows as Array<{ name: string; slug: string; arrondissement: string | null; city: string | null }>).map((v) => ({
        name: v.name,
        slug: v.slug,
        area: v.arrondissement ?? (v.city && v.city.toLowerCase() !== 'paris' ? v.city : null),
      })),
      categories: matchCategories(q),
      events: eventList,
    }
  })
}

/** Categories whose name starts with (or contains) the query. Pure, no database. */
export function matchCategories(q: string): Suggestions['categories'] {
  const f = foldText(q)
  if (f.length < 2) return []
  return CATEGORIES.filter((c) => foldText(c.plural).includes(f) || foldText(c.name).startsWith(f) || c.slug.startsWith(f))
    .slice(0, 3)
    .map((c) => ({ label: c.plural, href: `/categories/${c.slug}` }))
}

const cached = unstable_cache(load, ['suggest-v1'], { revalidate: 900, tags: ['events'] })

export function getSuggestions(raw: string): Promise<Suggestions> {
  const q = normalizeSuggestQuery(raw)
  if (q.length < 3) return Promise.resolve({ ...EMPTY_SUGGESTIONS, categories: matchCategories(q) })
  return withTimeout(cached(q), STATEMENT_TIMEOUT_MS + 1000, 'suggest')
}
