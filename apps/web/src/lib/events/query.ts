/**
 * Central event data layer. Every page and API route goes through here so the
 * definition of "live", of a time window, of a filter or of the ranking exists
 * exactly once.
 */
import 'server-only'
import { unstable_cache } from 'next/cache'
import { events, venues, categories, withStatementTimeout } from '@sortir/db'
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { DEFAULT_DURATION_MS, LONG_RUN_MS, resolveWindow, type TimeWindow } from '@/lib/paris-time'
import { INTENT_RULES, OUTING_CATEGORIES, RECURRING_CLASS_CATEGORIES, TOPIC_RULES } from './taxonomy'
import { ACCENTS_FROM, ACCENTS_TO, filmSlug, foldText } from './fold'
import { workLikePattern } from './works-utils'
import { SIGNATURE_VENUE_REGEX, isSignatureVenue } from '@/lib/venues-signature'

export { foldText }
import type { CardEvent, EventPage, EventQuery } from './types'

/**
 * "Now" rounded to 5 minutes, for display and windows. It is NOT part of any cache
 * key: keys used to include it, so every cached listing expired at the same instant
 * every 5 minutes and all pages hit the database together (outage of 9 Oct 2026).
 */
const BUCKET_MS = 5 * 60 * 1000
export const bucketNow = () => new Date(Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS)

const DEFAULT_DURATION = sql.raw(`interval '${DEFAULT_DURATION_MS / 60000} minutes'`)
const LONG_RUN = sql.raw(`interval '${LONG_RUN_MS / 60000} minutes'`)

/** Dates in raw SQL fragments must be sent as ISO strings (postgres.js does not map them). */
export const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`

/** Effective end of an event (end_date, or start + 2h). */
export const effectiveEndSql = sql`coalesce(${events.endDate}, ${events.startDate} + ${DEFAULT_DURATION})`
const isLongRunSql = sql`(${events.endDate} is not null and ${events.endDate} - ${events.startDate} > ${LONG_RUN})`

/** Published, not a duplicate, not over. */
export function liveCondition(now: Date): SQL {
  return and(
    eq(events.status, 'active'),
    sql`${events.canonicalEventId} is null`,
    sql`${effectiveEndSql} >= ${ts(now)}`
  )!
}

/**
 * An event belongs to a window when it starts inside it, or when it already
 * started and is still running: long runs (exhibitions) for windows that accept
 * them, one-off events only if the window starts now (they are happening now).
 */
export function windowCondition(w: TimeWindow, now: Date): SQL {
  const startsNow = w.start.getTime() <= now.getTime() + 5 * 60_000
  return and(
    sql`${events.startDate} <= ${ts(w.end)}`,
    sql`${effectiveEndSql} >= ${ts(w.start)}`,
    sql`(${events.startDate} >= ${ts(w.start)}
      ${w.includeOngoing ? sql`or ${isLongRunSql}` : sql``}
      ${startsNow ? sql`or not ${isLongRunSql}` : sql``})`
  )!
}

/** Lowercase + strip French accents, same transform on both sides (constants in ./fold). */
// Inlined constants (not bind parameters) so the expression matches the trigram
// index idx_events_search_trgm (packages/db/sql/0006) character for character.
const foldSql = (expr: SQL) => sql`translate(lower(${expr}), ${sql.raw(`'${ACCENTS_FROM}'`)}, ${sql.raw(`'${ACCENTS_TO}'`)})`

/** Event text, indexed (GIN trigram) — keep in sync with 0006_search_index.sql. */
const eventSearchText = foldSql(
  sql`${events.title} || ' ' || coalesce(${events.shortDesc}, '') || ' ' || coalesce(${events.keywords}, '')`
)

/** Text match on the event or on its venue name (venues is small). `= any(array(…))`
 * lets Postgres combine both indexes (BitmapOr): 4.2 s → 0.17 s for "jazz". */
export function textMatch(op: 'like' | '~', pattern: string): SQL {
  return sql`(${eventSearchText} ${sql.raw(op)} ${pattern}
    or ${events.venueId} = any(array(select v.id from venues v where ${foldSql(sql`v.name`)} ${sql.raw(op)} ${pattern})))`
}

const STOP_WORDS = new Set(
  'a au aux avec ce ces dans de des du en et je la le les mon ma mes ou par pas pour quelque chose sur un une veux voudrais cherche ce soir paris sortir sortie truc'.split(
    ' '
  )
)

/** Search words matched as whole words (music genres; see search-synonyms.ts). */
const WHOLE_WORD_TOKENS = new Set([
  'metal', 'metalcore', 'rock', 'punk', 'hardcore', 'jazz', 'blues', 'rap', 'techno', 'electro', 'house',
  'reggae', 'ska', 'soul', 'funk', 'folk', 'rnb', 'disco', 'salsa', 'grunge', 'emo', 'indie',
])

export function searchTokens(q: string): string[] {
  return foldText(q)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
    .slice(0, 6)
}

export function intentCondition(slug: string): SQL | null {
  const rule = INTENT_RULES[slug]
  if (!rule) return null
  const parts: SQL[] = [textMatch('~', foldText(rule.pattern))]
  if (rule.categories?.length) {
    parts.push(sql`${categories.slug} in ${rule.categories}`)
  }
  const match = sql`(${sql.join(parts, sql` or `)})`
  if (!rule.excludePattern) return match
  return sql`(${match} and not ${textMatch('~', foldText(rule.excludePattern))})`
}

function distanceSql(lat: number, lng: number): SQL {
  return sql`(111.32 * sqrt(power(${venues.lat} - ${lat}, 2) + power((${venues.lng} - ${lng}) * cos(radians(${lat})), 2)))`
}

/**
 * Film key of a séance (same as filmSlug() in ./fold): one card per film.
 * Only evaluated on cinema rows.
 */
export const filmKeySql = sql`trim(both '-' from regexp_replace(${foldSql(sql`${events.title}`)}, '[^a-z0-9]+', '-', 'g'))`

/**
 * Rows of a work (same title key, see lib/events/works-utils.ts). The LIKE on
 * the indexed event text narrows the candidates with idx_events_search_trgm;
 * the exact key check runs on those few rows only.
 */
export function workMatchSql(slug: string): SQL {
  return sql`(${eventSearchText} like ${workLikePattern(slug)} and ${filmKeySql} = ${slug})`
}

/**
 * Ids of the "lieux phares" venues (lib/venues-signature.ts, matched on the
 * folded name, aliases included). One regex pass over the venues table every
 * 6 hours instead of one per listing query; the listings then use a plain
 * `venue_id in (…)` list. Empty on error: no boost, no "grandes scènes".
 */
const loadSignatureVenueIds = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
      tx
        .select({ id: venues.id })
        .from(venues)
        .where(sql`${foldSql(sql`${venues.name}`)} ~ ${SIGNATURE_VENUE_REGEX}`)
        .limit(500)
    )
    return rows.map((r) => String(r.id))
  },
  ['signature-venue-ids-v1'],
  { revalidate: 6 * 3600, tags: ['venues'] }
)

export async function getSignatureVenueIds(): Promise<string[]> {
  try {
    return await withTimeout(loadSignatureVenueIds(), STATEMENT_TIMEOUT_MS + 1500, 'signatureVenueIds')
  } catch (err) {
    console.error('[events] signature venues failed', err)
    return []
  }
}

export function signatureVenueSql(ids: string[]): SQL {
  return ids.length ? sql`${events.venueId} in ${ids}` : sql`false`
}

/** Venue in Paris proper (arrondissement known or 75xxx zip). */
const inParisSql = sql`(${venues.arrondissement} is not null or ${venues.zipCode} like '75%')`

/**
 * Editorial-ish ranking: quality, popularity, has picture, known time, soonness.
 * Paris first (petite couronne a bit lower), real outings before administrative
 * or professional sessions (mairie, permanence, job dating…).
 */
function relevanceSql(now: Date, signatureIds: string[]): SQL {
  return sql`(
    ${events.qualityScore}
    + case when ${venues.id} is null then -4 when ${inParisSql} then 0 else -10 end
    ${signatureIds.length ? sql`+ case when ${signatureVenueSql(signatureIds)} then 6 else 0 end` : sql``}
    + case when ${categories.slug} in ${OUTING_CATEGORIES} then 4 when ${categories.slug} is null then -4 else 0 end
    + least(${events.saveCount} * 3 + ${events.viewCount} / 25, 25)
    + case when ${events.imageUrl} is null then -25 else 0 end
    + case when ${events.timeKnown} then 0 else -8 end
    + case when ${events.priceStatus} = 'unknown' then -4 else 0 end
    + case when ${isLongRunSql} then -6 else 0 end
    - least(greatest(extract(epoch from (${events.startDate} - ${ts(now)})) / 86400, 0), 30) * 0.8
  )`
}

const cardColumns = {
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
}

type CardRow = {
  [K in keyof typeof cardColumns]: unknown
} & { distanceKm?: unknown; filmN?: unknown; filmM?: unknown; filmTimes?: unknown; filmImage?: unknown }

export function toCard(r: CardRow): CardEvent {
  const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? String(d) : null)
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    shortDesc: (r.shortDesc as string) ?? null,
    imageUrl: (r.imageUrl as string) ?? (r.filmImage as string) ?? null,
    startDate: iso(r.startDate)!,
    endDate: iso(r.endDate),
    timeKnown: r.timeKnown !== false,
    priceMin: Number(r.priceMin ?? 0),
    priceMax: Number(r.priceMax ?? 0),
    priceStatus: (r.priceStatus as CardEvent['priceStatus']) ?? 'unknown',
    isFree: Boolean(r.isFree),
    saveCount: Number(r.saveCount ?? 0),
    qualityScore: Number(r.qualityScore ?? 0),
    category: r.categorySlug
      ? { slug: String(r.categorySlug), name: String(r.categoryName), icon: (r.categoryIcon as string) ?? null }
      : null,
    venue: r.venueName
      ? {
          name: String(r.venueName),
          slug: String(r.venueSlug),
          arrondissement: (r.venueArr as string) ?? null,
          // Only kept outside Paris, where the town is what people need.
          city: !r.venueArr && !String(r.venueZip ?? '').startsWith('75') && r.venueCity ? String(r.venueCity) : null,
          lat: r.venueLat == null ? null : Number(r.venueLat),
          lng: r.venueLng == null ? null : Number(r.venueLng),
          signature: isSignatureVenue(String(r.venueName)),
        }
      : null,
    distanceKm: r.distanceKm == null ? null : Math.round(Number(r.distanceKm) * 10) / 10,
    film:
      r.filmN != null && Number(r.filmN) > 1
        ? {
            slug: filmSlug(String(r.title)),
            seances: Number(r.filmN),
            salles: Number(r.filmM ?? 1),
            nextTimes: toIsoList(r.filmTimes).slice(0, 4),
          }
        : null,
  }
}

/** Postgres arrays come back as JS arrays or as '{…}' literals depending on the driver path. */
function toIsoList(v: unknown): string[] {
  const list = Array.isArray(v)
    ? v
    : typeof v === 'string'
      ? v.replace(/^\{|\}$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).filter(Boolean)
      : []
  return list.map((x) => (x instanceof Date ? x : new Date(String(x)))).filter((d) => !Number.isNaN(d.getTime())).map((d) => d.toISOString())
}

export function buildConditions(
  query: EventQuery,
  now: Date,
  signatureIds: string[] = []
): { where: SQL; window: TimeWindow | null } {
  // Cancellations and administrative topics are scored at ingestion (scrapers/validation):
  // computing them here on every row made each listing ~10x heavier (outage of 9 Oct, 14:00).
  const conds: SQL[] = [liveCondition(now)]
  const window = resolveWindow(query.when, now)
  if (window) conds.push(windowCondition(window, now))

  if (query.categories?.length) conds.push(inArray(categories.slug, query.categories))
  if (query.excludeCategories?.length) {
    conds.push(sql`(${categories.slug} is null or ${categories.slug} not in ${query.excludeCategories})`)
  }
  if (query.excludeTitle) conds.push(sql`lower(${events.title}) <> ${query.excludeTitle.toLowerCase()}`)
  if (window?.key === 'tonight') {
    // Weekly classes stored as one long run (yoga, conversation, atelier hebdo)
    // start "tonight" every week: they stay in their category, not in "Ce soir".
    conds.push(sql`not (${events.endDate} is not null and ${events.endDate} - ${events.startDate} > interval '60 days'
      and (${categories.slug} is null or ${categories.slug} in ${RECURRING_CLASS_CATEGORIES}))`)
  }
  if (query.arrondissements?.length) conds.push(inArray(venues.arrondissement, query.arrondissements))
  if (query.free) conds.push(eq(events.priceStatus, 'free'))
  if (query.maxPrice != null && query.maxPrice >= 0) {
    conds.push(sql`(${events.priceStatus} = 'free' or (${events.priceStatus} = 'paid' and ${events.priceMin} <= ${Math.round(query.maxPrice * 100)}))`)
  }
  if (query.runsEndingWithinDays) {
    conds.push(isLongRunSql)
    conds.push(sql`${events.endDate} <= ${ts(new Date(now.getTime() + query.runsEndingWithinDays * 86400_000))}`)
  }
  if (query.oneOffOnly) conds.push(sql`not ${isLongRunSql}`)
  if (query.withImage) conds.push(sql`${events.imageUrl} is not null`)
  if (query.venueSlug) conds.push(eq(venues.slug, query.venueSlug))
  if (query.signatureOnly) conds.push(signatureVenueSql(signatureIds))
  if (query.ids) conds.push(query.ids.length ? sql`${events.id} in ${query.ids}` : sql`false`)
  if (query.excludeIds?.length) conds.push(sql`${events.id} not in ${query.excludeIds}`)
  for (const slug of query.intents ?? []) {
    const c = intentCondition(slug)
    if (c) conds.push(c)
  }
  for (const slug of query.topics ?? []) {
    const rule = TOPIC_RULES[slug]
    if (!rule) continue
    const match = textMatch('~', foldText(rule.pattern))
    conds.push(rule.excludePattern ? sql`(${match} and not ${textMatch('~', foldText(rule.excludePattern))})` : match)
  }
  if (query.q) {
    const tokens = searchTokens(query.q)
    for (const t of tokens) {
      // Genre words match whole words only ("metal" must not find "Métallos").
      conds.push(WHOLE_WORD_TOKENS.has(t) ? textMatch('~', `\\m${t}\\M`) : textMatch('like', '%' + t + '%'))
    }
  }
  if (query.near) {
    const radius = query.near.radiusKm ?? 3
    conds.push(sql`${venues.lat} is not null`)
    // Cheap bounding box first (uses idx_venues_geo), exact distance after.
    const dLat = radius / 111.32
    const dLng = radius / (111.32 * Math.cos((query.near.lat * Math.PI) / 180))
    conds.push(sql`${venues.lat} between ${query.near.lat - dLat} and ${query.near.lat + dLat}`)
    conds.push(sql`${venues.lng} between ${query.near.lng - dLng} and ${query.near.lng + dLng}`)
    conds.push(sql`${distanceSql(query.near.lat, query.near.lng)} <= ${radius}`)
  }
  return { where: and(...conds)!, window }
}

/** Server-side limit for listing queries (Postgres cancels them itself). */
export const STATEMENT_TIMEOUT_MS = 6000

async function runQuery(query: EventQuery): Promise<EventPage> {
  const nowMs = bucketNow().getTime()
  const now = new Date(nowMs)
  const limit = Math.min(Math.max(query.limit ?? 24, 1), 100)
  const offset = Math.max(query.offset ?? 0, 0)
  const sort = query.sort ?? (query.near ? 'distance' : 'relevance')
  const signatureIds = query.signatureOnly || sort === 'relevance' ? await getSignatureVenueIds() : []
  const { where, window } = buildConditions(query, now, signatureIds)

  const order: SQL[] = []
  switch (sort) {
    case 'soon':
      // Ongoing runs after the one-offs starting soon.
      order.push(sql`case when ${events.startDate} < ${ts(window?.start ?? now)} then 1 else 0 end`, asc(events.startDate))
      break
    case 'popular':
      order.push(desc(sql`${events.saveCount} * 3 + ${events.viewCount}`))
      break
    case 'ending':
      order.push(asc(effectiveEndSql))
      break
    case 'distance':
      // Same venue (same distance): soonest first.
      if (query.near) order.push(asc(distanceSql(query.near.lat, query.near.lng)), asc(events.startDate))
      break
    case 'random':
      order.push(sql`md5(${events.id}::text || ${Math.floor(nowMs / 3600_000)})`)
      break
    default:
      order.push(desc(relevanceSql(now, signatureIds)))
  }
  order.push(asc(events.id))

  const groupFilms = shouldGroupFilms(query)

  return withStatementTimeout(STATEMENT_TIMEOUT_MS, async (tx) => {
    // One row per film among the cinema séances matching the same filters: the
    // next séance stands for the film, with counts and the next times. Computed
    // on the cinema rows only (one GROUP BY), joined back on the chosen séance.
    const films = groupFilms
      ? tx
          .select({
            best: sql<string>`(array_agg(${events.id} order by ${events.startDate}, ${events.id}))[1]`.as('film_best'),
            n: sql<number>`count(*)`.as('film_n'),
            m: sql<number>`count(distinct ${events.venueId})`.as('film_m'),
            times: sql<string[]>`(array_agg(${events.startDate} order by ${events.startDate}))[1:4]`.as('film_times'),
            image: sql<string | null>`(array_agg(${events.imageUrl} order by ${events.startDate}) filter (where ${events.imageUrl} is not null))[1]`.as('film_image'),
          })
          .from(events)
          .leftJoin(venues, eq(events.venueId, venues.id))
          .leftJoin(categories, eq(events.categoryId, categories.id))
          .where(and(where, eq(categories.slug, 'cinema')))
          .groupBy(filmKeySql)
          .as('films')
      : null

    const filmWhere = films ? and(where, sql`(${categories.slug} is distinct from 'cinema' or ${films.best} is not null)`)! : where
    const base = tx
      .select({
        ...cardColumns,
        distanceKm: query.near ? distanceSql(query.near.lat, query.near.lng) : sql`null`,
        filmN: films ? films.n : sql`null`,
        filmM: films ? films.m : sql`null`,
        filmTimes: films ? films.times : sql`null`,
        filmImage: films ? films.image : sql`null`,
      })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
    // limit + 1 tells whether there is more without counting everything.
    const rows = await (films ? base.leftJoin(films, sql`${films.best} = ${events.id}`) : base)
      .where(filmWhere)
      .orderBy(...order)
      .limit(limit + 1)
      .offset(offset)

    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    let total = offset + page.length + (hasMore ? 1 : 0)
    // The exact total is only shown with the first page ("1 234 sorties").
    // Films count once each, like the cards.
    if (offset === 0 && hasMore) {
      const [c] = await tx
        .select({
          n: groupFilms
            ? sql<number>`count(*) filter (where ${categories.slug} is distinct from 'cinema') + count(distinct ${filmKeySql}) filter (where ${categories.slug} = 'cinema')`
            : sql<number>`count(*)`,
        })
        .from(events)
        .leftJoin(venues, eq(events.venueId, venues.id))
        .leftJoin(categories, eq(events.categoryId, categories.id))
        .where(where)
      total = Number(c?.n ?? total)
    }
    return { events: page.map(toCard), total, hasMore }
  })
}

/** Cinema séances are grouped per film unless the query targets precise events. */
export function shouldGroupFilms(query: EventQuery): boolean {
  if (query.groupFilms === false || query.ids) return false
  if (query.categories?.length && !query.categories.includes('cinema')) return false
  if (query.excludeCategories?.includes('cinema')) return false
  return true
}

/** Reject after `ms` so a stuck query can never hang a page render. */
export function withTimeout<T>(promise: Promise<T>, ms = 8000, label = 'query'): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    }),
  ])
}

// Keyed by the query only: entries are refreshed in the background every 5 min and
// the previous result keeps being served while (or if) the refresh fails.
// 15 min: the catalogue changes twice a day (scrapes); each refresh is a database query.
const cachedQuery = unstable_cache(runQuery, ['events-query-v3'], { revalidate: 900, tags: ['events'] })

/** Cached, time-bucketed event query. Geolocated queries are rounded to ~100 m for cache hits. */
export function queryEvents(query: EventQuery): Promise<EventPage> {
  const q: EventQuery = { ...query }
  if (q.near) {
    q.near = {
      lat: Math.round(q.near.lat * 1000) / 1000,
      lng: Math.round(q.near.lng * 1000) / 1000,
      radiusKm: q.near.radiusKm,
    }
  }
  if (q.q) q.q = q.q.trim().slice(0, 120)
  return withTimeout(cachedQuery(q), STATEMENT_TIMEOUT_MS + 1500, 'queryEvents')
}

/** Same as queryEvents but never throws: returns an empty page and logs. */
export async function safeQueryEvents(query: EventQuery): Promise<EventPage & { error?: boolean }> {
  try {
    return await queryEvents(query)
  } catch (err) {
    console.error('[events] query failed', err)
    return { events: [], total: 0, hasMore: false, error: true }
  }
}

/**
 * Re-order so the same venue / category doesn't repeat back-to-back.
 * Keeps the overall ranking (greedy pick of the best remaining compatible item).
 */
export function diversify(list: CardEvent[], max: number): CardEvent[] {
  const out: CardEvent[] = []
  const pool = [...list]
  const venueCount = new Map<string, number>()
  while (out.length < max && pool.length) {
    const prevCat = out.at(-1)?.category?.slug
    let idx = pool.findIndex(
      (e) =>
        (venueCount.get(e.venue?.slug ?? e.id) ?? 0) === 0 &&
        (e.category?.slug !== prevCat || !prevCat)
    )
    if (idx === -1) idx = pool.findIndex((e) => (venueCount.get(e.venue?.slug ?? e.id) ?? 0) < 2)
    if (idx === -1) idx = 0
    const [picked] = pool.splice(idx, 1)
    out.push(picked)
    const key = picked.venue?.slug ?? picked.id
    venueCount.set(key, (venueCount.get(key) ?? 0) + 1)
  }
  return out
}

/** Counts per category for the live catalogue (navigation badges). */
export const getCategoryCounts = unstable_cache(
  async () => {
    const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
      tx
        .select({ slug: categories.slug, n: sql<number>`count(*)` })
        .from(events)
        .innerJoin(categories, eq(events.categoryId, categories.id))
        .where(liveCondition(bucketNow()))
        .groupBy(categories.slug)
    )
    return Object.fromEntries(rows.map((r) => [r.slug, Number(r.n)])) as Record<string, number>
  },
  ['category-counts-v2'],
  { revalidate: 1800, tags: ['events'] }
)
