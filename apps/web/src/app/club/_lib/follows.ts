/**
 * Follows: data access (server only). Matches of a follow target are cached
 * per target (not per member, no time in the key) and shared by every member
 * who follows it; the per-member part (since when, grouping) is pure, in lib/follows.ts.
 */
import 'server-only'
import { unstable_cache } from 'next/cache'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { categories, events, userFollows, venues, withStatementTimeout } from '@sortir/db'
import { STATEMENT_TIMEOUT_MS, bucketNow, liveCondition, textMatch, toCard, ts, withTimeout } from '@/lib/events/query'
import {
  MAX_FOLLOWS,
  followKey,
  groupNewMatches,
  lastDates,
  likePattern,
  type Follow,
  type FollowGroup,
  type FollowMatch,
  type LastDate,
} from '@/lib/follows'
import { cardColumns } from './member'

const iso = (d: Date | string | null) => (d == null ? null : d instanceof Date ? d.toISOString() : String(d))

/** The member's follows, newest first (idx_user_follows_user). */
export async function listFollows(userId: string): Promise<Follow[]> {
  const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
    tx
      .select({
        id: userFollows.id,
        kind: userFollows.kind,
        venueId: userFollows.venueId,
        term: userFollows.term,
        label: userFollows.label,
        venueSlug: venues.slug,
        createdAt: userFollows.createdAt,
        lastSeenAt: userFollows.lastSeenAt,
        lastNotifiedAt: userFollows.lastNotifiedAt,
      })
      .from(userFollows)
      .leftJoin(venues, eq(venues.id, userFollows.venueId))
      .where(eq(userFollows.userId, userId))
      .orderBy(desc(userFollows.createdAt), asc(userFollows.id))
      .limit(MAX_FOLLOWS)
  )
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    venueId: r.venueId,
    term: r.term,
    label: r.label,
    venueSlug: r.venueSlug ?? null,
    createdAt: iso(r.createdAt)!,
    lastSeenAt: iso(r.lastSeenAt)!,
    lastNotifiedAt: iso(r.lastNotifiedAt),
  }))
}

const NEWEST = 20
const SOONEST = 10

/** Séances / dates of the same title at the same venue count once. */
function dedupeRuns(list: FollowMatch[]): FollowMatch[] {
  const seen = new Set<string>()
  return list.filter((m) => {
    const k = `${m.event.title.toLowerCase()}|${m.event.venue?.slug ?? ''}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/**
 * Live events of a follow target: the 20 most recently added and the 10 next
 * to start. Venue: the venue and its aliases (idx_events_venue_id). Artist /
 * work: the trigram-indexed text match of the search (textMatch).
 */
async function loadMatches(kind: 'venue' | 'artist', key: string): Promise<{ newest: FollowMatch[]; soonest: FollowMatch[] }> {
  const now = bucketNow()
  const target =
    kind === 'venue'
      ? sql`(${events.venueId} = ${key} or ${events.venueId} in (select a.id from venues a where a.canonical_venue_id = ${key}))`
      : textMatch('like', likePattern(key))
  const where = and(liveCondition(now), target)
  const select = { ...cardColumns, addedAt: events.createdAt }
  const map = <R extends Parameters<typeof toCard>[0] & { addedAt: Date }>(rows: R[]): FollowMatch[] =>
    rows.map((r) => ({ event: toCard(r), addedAt: iso(r.addedAt)! }))

  return withStatementTimeout(STATEMENT_TIMEOUT_MS, async (tx) => {
    const base = () =>
      tx
        .select(select)
        .from(events)
        .leftJoin(venues, eq(events.venueId, venues.id))
        .leftJoin(categories, eq(events.categoryId, categories.id))
    const newest = await base().where(where).orderBy(desc(events.createdAt), asc(events.id)).limit(NEWEST)
    const soonest = await base()
      .where(and(where, sql`${events.startDate} >= ${ts(now)}`))
      .orderBy(asc(events.startDate), asc(events.id))
      .limit(SOONEST)
    return { newest: dedupeRuns(map(newest)), soonest: dedupeRuns(map(soonest)) }
  })
}

const cachedMatches = unstable_cache(loadMatches, ['follow-matches-v1'], { revalidate: 900, tags: ['events', 'follows'] })

/** Matches of one target (newest ∪ soonest), never throws. */
export async function getFollowMatches(f: Pick<Follow, 'kind' | 'venueId' | 'term'>): Promise<FollowMatch[]> {
  const key = f.kind === 'venue' ? f.venueId : f.term
  if (!key) return []
  try {
    const { newest, soonest } = await withTimeout(cachedMatches(f.kind, key), STATEMENT_TIMEOUT_MS + 1500, 'followMatches')
    const ids = new Set(newest.map((m) => m.event.id))
    return [...newest, ...soonest.filter((m) => !ids.has(m.event.id))]
  } catch (err) {
    console.error('[follows] matches failed', err)
    return []
  }
}

/** Follows computed per page view (the rest wait for the next visit). */
const FEED_FOLLOWS = 40
const CONCURRENCY = 3

export interface FollowFeed {
  follows: Follow[]
  groups: FollowGroup[]
  lastDates: LastDate[]
  newCount: number
  error: boolean
}

/** "Nouveautés pour toi" + "Dernières dates" for a member. */
export async function getFollowFeed(userId: string): Promise<FollowFeed> {
  let follows: Follow[]
  try {
    follows = await listFollows(userId)
  } catch (err) {
    console.error('[follows] list failed', err)
    return { follows: [], groups: [], lastDates: [], newCount: 0, error: true }
  }
  const active = follows.slice(0, FEED_FOLLOWS)
  const byKey = new Map<string, FollowMatch[]>()
  // Small batches: at most 3 cache misses hit the database together.
  for (let i = 0; i < active.length; i += CONCURRENCY) {
    const batch = active.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map((f) => getFollowMatches(f)))
    batch.forEach((f, j) => byKey.set(followKey(f), results[j]))
  }
  const groups = groupNewMatches(active, byKey)
  return {
    follows,
    groups,
    lastDates: lastDates(active, byKey, new Date()),
    newCount: groups.reduce((s, g) => s + g.matches.length, 0),
    error: false,
  }
}
