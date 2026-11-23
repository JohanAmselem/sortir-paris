/**
 * Club, real community data only: most viewed events of the week, most saved
 * events, and the member's progress on the "Défi de la semaine".
 * Shared lists are cached without time in the key; the per-member query reads
 * user_saves / user_attendances through their (user_id, event_id) primary keys.
 */
import 'server-only'
import { unstable_cache } from 'next/cache'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { categories, events, userSaves, venues, withStatementTimeout } from '@sortir/db'
import { STATEMENT_TIMEOUT_MS, bucketNow, liveCondition, toCard, windowCondition, withTimeout } from '@/lib/events/query'
import { getActiveVenues } from '@/lib/venues'
import { getWindow, parisDayStart, parisWeekStart } from '@/lib/paris-time'
import {
  challengeForWeek,
  challengeProgress,
  unvisitedTopVenues,
  type Challenge,
  type ChallengeProgress,
  type Interest,
} from '@/lib/challenges'
import type { CardEvent } from '@/lib/events/types'
import { cardColumns } from './member'

export interface CountedEvent {
  event: CardEvent
  count: number
}

/** Events of the next 7 days with the most page views (events.view_count, bots excluded at write time). */
const loadMostViewed = unstable_cache(
  async (): Promise<CountedEvent[]> => {
    const now = bucketNow()
    const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
      tx
        .select({ ...cardColumns, views: events.viewCount })
        .from(events)
        .leftJoin(venues, eq(events.venueId, venues.id))
        .leftJoin(categories, eq(events.categoryId, categories.id))
        .where(and(liveCondition(now), windowCondition(getWindow('week', now), now), sql`${events.viewCount} > 0`))
        .orderBy(desc(events.viewCount), asc(events.startDate), asc(events.id))
        .limit(6)
    )
    return rows.map((r) => ({ event: toCard(r), count: Number(r.views ?? 0) }))
  },
  ['club-most-viewed-week-v1'],
  { revalidate: 1800, tags: ['events', 'club'] }
)

/** Live events members saved the most (counted from user_saves, a small table). */
const loadMostSaved = unstable_cache(
  async (): Promise<CountedEvent[]> => {
    const now = bucketNow()
    const agg = withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) => {
      const counts = tx
        .select({ eventId: userSaves.eventId, n: sql<number>`count(*)::int`.as('n') })
        .from(userSaves)
        .groupBy(userSaves.eventId)
        .as('counts')
      return tx
        .select({ ...cardColumns, n: counts.n })
        .from(counts)
        .innerJoin(events, eq(events.id, counts.eventId))
        .leftJoin(venues, eq(events.venueId, venues.id))
        .leftJoin(categories, eq(events.categoryId, categories.id))
        .where(liveCondition(now))
        .orderBy(desc(counts.n), asc(events.startDate), asc(events.id))
        .limit(6)
    })
    const rows = await agg
    return rows.map((r) => ({ event: toCard(r), count: Number(r.n ?? 0) }))
  },
  ['club-most-saved-v1'],
  { revalidate: 600, tags: ['club'] }
)

export async function getCommunityHighlights(): Promise<{ mostViewed: CountedEvent[]; mostSaved: CountedEvent[]; savedError: boolean }> {
  const [viewed, saved] = await Promise.allSettled([
    withTimeout(loadMostViewed(), STATEMENT_TIMEOUT_MS + 1500, 'mostViewed'),
    withTimeout(loadMostSaved(), STATEMENT_TIMEOUT_MS + 1500, 'mostSaved'),
  ])
  if (viewed.status === 'rejected') console.error('[club] most viewed failed', viewed.reason)
  if (saved.status === 'rejected') console.error('[club] most saved failed', saved.reason)
  return {
    mostViewed: viewed.status === 'fulfilled' ? viewed.value : [],
    mostSaved: saved.status === 'fulfilled' ? saved.value : [],
    savedError: saved.status === 'rejected',
  }
}

// ── Défi de la semaine ─────────────────────────────────────────────────────

/** The member's saves and « j'y vais » (most recent 500), with venue / category / price. */
async function getInterests(userId: string): Promise<Interest[]> {
  const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
    tx.execute<{
      kind: 'save' | 'attend'
      at: Date | string
      venue_slug: string | null
      arr: string | null
      category_id: string | null
      free: boolean
    }>(sql`
      select i.kind, i.at, cv.slug as venue_slug, coalesce(cv.arrondissement, v.arrondissement) as arr,
             e.category_id, (e.price_status = 'free' or e.is_free) as free
      from (
        select event_id, created_at as at, 'save' as kind from user_saves where user_id = ${userId}
        union all
        select event_id, created_at as at, 'attend' as kind from user_attendances where user_id = ${userId}
      ) i
      join events e on e.id = i.event_id
      left join venues v on v.id = e.venue_id
      left join venues cv on cv.id = coalesce(v.canonical_venue_id, v.id)
      order by i.at desc
      limit 500
    `)
  )
  return [...rows].map((r) => ({
    kind: r.kind,
    at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
    venueSlug: r.venue_slug,
    arrondissement: r.arr,
    categoryId: r.category_id,
    free: Boolean(r.free),
  }))
}

/** Monday 00:00 (Paris) of the current week. */
export function currentWeekStart(now = new Date()): { key: string; at: Date } {
  const key = parisWeekStart(now)
  return { key, at: parisDayStart(new Date(`${key}T12:00:00Z`)) }
}

export interface WeeklyChallenge {
  challenge: Challenge
  /** Null for anonymous visitors or when the data layer is down. */
  progress: ChallengeProgress | null
  /** Real venues to try (lieu phare): top venues the member has never saved anything at. */
  ideas: Array<{ slug: string; name: string; arrondissement: string | null }>
}

export async function getWeeklyChallenge(userId: string | null): Promise<WeeklyChallenge> {
  const week = currentWeekStart()
  const challenge = challengeForWeek(week.key)
  const needsVenues = challenge.slug === 'lieu-phare'
  const [interests, top] = await Promise.all([
    userId ? getInterests(userId).catch((err) => (console.error('[club] interests failed', err), null)) : Promise.resolve(null),
    needsVenues ? getActiveVenues().then((v) => v.slice(0, 30)).catch(() => []) : Promise.resolve([]),
  ])
  const progress = interests ? challengeProgress(challenge, interests, week.at, top.map((v) => v.slug)) : null
  const ideas = needsVenues ? unvisitedTopVenues(top, interests ?? [], 3) : []
  return {
    challenge,
    progress,
    ideas: ideas.map((v) => ({ slug: v.slug, name: v.name, arrondissement: v.arrondissement })),
  }
}
