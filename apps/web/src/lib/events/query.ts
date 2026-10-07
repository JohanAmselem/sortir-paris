/**
 * Central event data layer. Every page and API route goes through here so the
 * definition of "live", of a time window, of a filter or of the ranking exists
 * exactly once.
 */
import 'server-only'
import { unstable_cache } from 'next/cache'
import { db, events, venues, categories } from '@sortir/db'
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { DEFAULT_DURATION_MS, LONG_RUN_MS, resolveWindow, type TimeWindow } from '@/lib/paris-time'
import { INTENT_RULES } from './taxonomy'
import { foldText } from './fold'

export { foldText }
import type { CardEvent, EventPage, EventQuery } from './types'

/** Cache granularity: windows are computed from a 5-minute "now". */
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

/** Lowercase + strip French accents, same transform on both sides. */
const ACCENTS_FROM = 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ'
const ACCENTS_TO = 'aaaaaaceeeeiiiinooooouuuuyy'
const foldSql = (expr: SQL) => sql`translate(lower(${expr}), ${ACCENTS_FROM}, ${ACCENTS_TO})`

const searchableText = sql`(${events.title} || ' ' || coalesce(${events.shortDesc}, '') || ' ' || coalesce(${events.keywords}, '') || ' ' || coalesce(${venues.name}, ''))`

const STOP_WORDS = new Set(
  'a au aux avec ce ces dans de des du en et je la le les mon ma mes ou par pas pour quelque chose sur un une veux voudrais cherche ce soir paris sortir sortie truc'.split(
    ' '
  )
)

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
  const text = foldSql(searchableText)
  const parts: SQL[] = [sql`${text} ~ ${foldText(rule.pattern)}`]
  if (rule.categories?.length) {
    parts.push(sql`${categories.slug} in ${rule.categories}`)
  }
  const match = sql`(${sql.join(parts, sql` or `)})`
  if (!rule.excludePattern) return match
  return sql`(${match} and not ${text} ~ ${foldText(rule.excludePattern)})`
}

function distanceSql(lat: number, lng: number): SQL {
  return sql`(111.32 * sqrt(power(${venues.lat} - ${lat}, 2) + power((${venues.lng} - ${lng}) * cos(radians(${lat})), 2)))`
}

/** Editorial-ish ranking: quality, popularity, has picture, known time, soonness. */
function relevanceSql(now: Date): SQL {
  return sql`(
    ${events.qualityScore}
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
  venueLat: venues.lat,
  venueLng: venues.lng,
}

type CardRow = {
  [K in keyof typeof cardColumns]: unknown
} & { distanceKm?: unknown; total?: unknown }

export function toCard(r: CardRow): CardEvent {
  const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? String(d) : null)
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    shortDesc: (r.shortDesc as string) ?? null,
    imageUrl: (r.imageUrl as string) ?? null,
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
          lat: r.venueLat == null ? null : Number(r.venueLat),
          lng: r.venueLng == null ? null : Number(r.venueLng),
        }
      : null,
    distanceKm: r.distanceKm == null ? null : Math.round(Number(r.distanceKm) * 10) / 10,
  }
}

export function buildConditions(query: EventQuery, now: Date): { where: SQL; window: TimeWindow | null } {
  const conds: SQL[] = [liveCondition(now)]
  const window = resolveWindow(query.when, now)
  if (window) conds.push(windowCondition(window, now))

  if (query.categories?.length) conds.push(inArray(categories.slug, query.categories))
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
  if (query.ids) conds.push(query.ids.length ? sql`${events.id} in ${query.ids}` : sql`false`)
  if (query.excludeIds?.length) conds.push(sql`${events.id} not in ${query.excludeIds}`)
  for (const slug of query.intents ?? []) {
    const c = intentCondition(slug)
    if (c) conds.push(c)
  }
  if (query.q) {
    const tokens = searchTokens(query.q)
    const text = foldSql(searchableText)
    for (const t of tokens) conds.push(sql`${text} like ${'%' + t + '%'}`)
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

async function runQuery(query: EventQuery, nowMs: number): Promise<EventPage> {
  const now = new Date(nowMs)
  const limit = Math.min(Math.max(query.limit ?? 24, 1), 100)
  const offset = Math.max(query.offset ?? 0, 0)
  const { where, window } = buildConditions(query, now)

  const sort = query.sort ?? (query.near ? 'distance' : 'relevance')
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
      if (query.near) order.push(asc(distanceSql(query.near.lat, query.near.lng)))
      break
    case 'random':
      order.push(sql`md5(${events.id}::text || ${Math.floor(nowMs / 3600_000)})`)
      break
    default:
      order.push(desc(relevanceSql(now)))
  }
  order.push(asc(events.id))

  const rows = await db
    .select({
      ...cardColumns,
      distanceKm: query.near ? distanceSql(query.near.lat, query.near.lng) : sql`null`,
      total: sql<number>`count(*) over()`,
    })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(where)
    .orderBy(...order)
    .limit(limit)
    .offset(offset)

  const total = rows.length ? Number(rows[0].total) : 0
  return { events: rows.map(toCard), total, hasMore: offset + rows.length < total }
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

const cachedQuery = unstable_cache(runQuery, ['events-query-v1'], { revalidate: 300, tags: ['events'] })

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
  return withTimeout(cachedQuery(q, bucketNow().getTime()), 9000, 'queryEvents')
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
  async (nowMs: number) => {
    const rows = await db
      .select({ slug: categories.slug, n: sql<number>`count(*)` })
      .from(events)
      .innerJoin(categories, eq(events.categoryId, categories.id))
      .leftJoin(venues, eq(events.venueId, venues.id))
      .where(liveCondition(new Date(nowMs)))
      .groupBy(categories.slug)
    return Object.fromEntries(rows.map((r) => [r.slug, Number(r.n)])) as Record<string, number>
  },
  ['category-counts-v1'],
  { revalidate: 1800, tags: ['events'] }
)
