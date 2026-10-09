/**
 * Member data for the Club (hub, /compte, /top, /drop, /partage):
 * gamification sync, member overview, lean card queries.
 * All access is server-side through Drizzle (RLS has no policies).
 */
import 'server-only'
import { unstable_cache } from 'next/cache'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { categories, db, eventReviews, events, tasteProfiles, userSaves, userSwipes, users, venues, withStatementTimeout } from '@sortir/db'
import { STATEMENT_TIMEOUT_MS, bucketNow, effectiveEndSql, liveCondition, toCard, windowCondition, withTimeout } from '@/lib/events/query'
import { getWindow } from '@/lib/paris-time'
import {
  computeGamification,
  EMPTY_STATS,
  parseBadges,
  type GamificationState,
  type MemberStats,
} from '@/lib/gamification'
import type { CardEvent } from '@/lib/events/types'

// ── Card select (same columns as lib/events/query.ts → toCard) ──────────────

export const cardColumns = {
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

const VISIBLE = sql`${events.status} not in ('draft', 'rejected')`

/** Cards for explicit ids, in the given order (drop, shared selections). */
export async function getCardsByIds(ids: string[]): Promise<CardEvent[]> {
  if (!ids.length) return []
  const rows = await withTimeout(
    withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
      tx
        .select(cardColumns)
        .from(events)
        .leftJoin(venues, eq(events.venueId, venues.id))
        .leftJoin(categories, eq(events.categoryId, categories.id))
        .where(and(inArray(events.id, ids), VISIBLE))
    ),
    STATEMENT_TIMEOUT_MS + 1500,
    'getCardsByIds'
  )
  const byId = new Map(rows.map((r) => [String(r.id), toCard(r)]))
  return ids.map((id) => byId.get(id)).filter((e): e is CardEvent => !!e)
}

// ── Gamification ──────────────────────────────────────────────────────────

type StatsRow = {
  saves: number | string
  attendances: number | string
  reviews: number | string
  comments: number | string
  swipes: number | string
  quiz_done: boolean
  arrondissements: number | string
  categories: number | string
  free_events: number | string
}

export async function getMemberStats(userId: string): Promise<MemberStats> {
  const rows = await db.execute<StatsRow>(sql`
    with interest as (
      select event_id from user_saves where user_id = ${userId}
      union
      select event_id from user_attendances where user_id = ${userId}
    )
    select
      (select count(*) from user_saves where user_id = ${userId}) as saves,
      (select count(*) from user_attendances where user_id = ${userId}) as attendances,
      (select count(*) from event_reviews where user_id = ${userId}) as reviews,
      (select count(*) from event_reviews where user_id = ${userId} and coalesce(btrim(comment), '') <> '') as comments,
      (select count(*) from user_swipes where user_id = ${userId}) as swipes,
      exists(select 1 from taste_profiles where user_id = ${userId}) as quiz_done,
      (select count(distinct v.arrondissement) from interest i
         join events e on e.id = i.event_id join venues v on v.id = e.venue_id
         where v.arrondissement is not null) as arrondissements,
      (select count(distinct e.category_id) from (
         select event_id from interest
         union select event_id from event_reviews where user_id = ${userId}
       ) x join events e on e.id = x.event_id where e.category_id is not null) as categories,
      (select count(*) from interest i join events e on e.id = i.event_id
         where e.price_status = 'free' or e.is_free) as free_events
  `)
  const r = rows[0]
  if (!r) return EMPTY_STATS
  return {
    saves: Number(r.saves),
    attendances: Number(r.attendances),
    reviews: Number(r.reviews),
    comments: Number(r.comments),
    swipes: Number(r.swipes),
    quizDone: Boolean(r.quiz_done),
    arrondissements: Number(r.arrondissements),
    categories: Number(r.categories),
    freeEvents: Number(r.free_events),
  }
}

/**
 * Recompute XP / level / badges from the member's data and persist them when
 * they changed. Returns the new state and the badges earned by this action.
 * Never throws: gamification must not break the action that triggered it.
 */
export async function syncGamification(
  userId: string
): Promise<(GamificationState & { newBadges: string[]; stats: MemberStats }) | null> {
  try {
    const [stats, current] = await Promise.all([
      getMemberStats(userId),
      db.select({ xp: users.xp, level: users.level, badges: users.badges }).from(users).where(eq(users.id, userId)).limit(1),
    ])
    const next = computeGamification(stats)
    const before = parseBadges(current[0]?.badges)
    const newBadges = next.badges.filter((b) => !before.includes(b))
    const badgesStr = next.badges.join(',')
    if (current[0] && (current[0].xp !== next.xp || current[0].level !== next.level || current[0].badges !== badgesStr)) {
      await db
        .update(users)
        .set({ xp: next.xp, level: next.level, badges: badgesStr, updatedAt: new Date() })
        .where(eq(users.id, userId))
    }
    return { ...next, newBadges, stats }
  } catch (err) {
    console.error('[gamification] sync failed', err)
    return null
  }
}

export interface MemberOverview {
  name: string | null
  avatarUrl: string | null
  memberSince: string | null
  onboarded: boolean
  stats: MemberStats
  xp: number
  level: number
  badges: string[]
  archetype: string | null
  upcomingSaved: number
}

/** Everything the hub and /compte need about a member. Null when the data layer is down. */
export async function getMemberOverview(userId: string): Promise<MemberOverview | null> {
  try {
    const [row, profile, sync, upcoming] = await Promise.all([
      db.select().from(users).where(eq(users.id, userId)).limit(1),
      db.select({ archetype: tasteProfiles.archetype }).from(tasteProfiles).where(eq(tasteProfiles.userId, userId)).limit(1),
      syncGamification(userId),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(userSaves)
        .innerJoin(events, eq(userSaves.eventId, events.id))
        .where(and(eq(userSaves.userId, userId), sql`${effectiveEndSql} >= now()`)),
    ])
    const u = row[0]
    const stats = sync?.stats ?? EMPTY_STATS
    const state = sync ?? computeGamification(stats)
    return {
      name: u?.name ?? null,
      avatarUrl: u?.avatarUrl ?? null,
      memberSince: u?.createdAt ? u.createdAt.toISOString() : null,
      onboarded: u?.onboarded ?? false,
      stats,
      xp: state.xp,
      level: state.level,
      badges: state.badges,
      archetype: profile[0]?.archetype ?? null,
      upcomingSaved: Number(upcoming[0]?.n ?? 0),
    }
  } catch (err) {
    console.error('[member] overview failed', err)
    return null
  }
}

// ── Saved events ──────────────────────────────────────────────────────────

export async function getSavedEvents(userId: string): Promise<{ upcoming: CardEvent[]; past: CardEvent[] }> {
  const rows = await withTimeout(
    db
      .select({ ...cardColumns, ended: sql<boolean>`${effectiveEndSql} < now()` })
      .from(userSaves)
      .innerJoin(events, eq(userSaves.eventId, events.id))
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(eq(userSaves.userId, userId), VISIBLE))
      .orderBy(asc(events.startDate))
      .limit(300),
    8000,
    'getSavedEvents'
  )
  const upcoming: CardEvent[] = []
  const past: CardEvent[] = []
  for (const r of rows) (r.ended ? past : upcoming).push(toCard(r))
  past.reverse() // most recent first
  return { upcoming, past }
}

// ── Top des membres ───────────────────────────────────────────────────────

export interface RankedEvent {
  event: CardEvent
  saves: number
  attendances: number
}

/** Upcoming events of the next 7 days the members saved / plan to attend the most. */
export const getMembersTopThisWeek = unstable_cache(
  // Keyed without time (see lib/events/query.ts): "now" is read inside.
  async (): Promise<RankedEvent[]> => {
    const now = bucketNow()
    const w = getWindow('week', now)
    const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
      tx
        .select({ ...cardColumns, attendanceCount: events.attendanceCount })
        .from(events)
        .leftJoin(venues, eq(events.venueId, venues.id))
        .leftJoin(categories, eq(events.categoryId, categories.id))
        .where(and(liveCondition(now), windowCondition(w, now), sql`(${events.saveCount} + ${events.attendanceCount}) > 0`))
        .orderBy(desc(sql`${events.saveCount} + ${events.attendanceCount} * 2`), asc(events.startDate), asc(events.id))
        .limit(12)
    )
    return rows.map((r) => ({ event: toCard(r), saves: Number(r.saveCount ?? 0), attendances: Number(r.attendanceCount ?? 0) }))
  },
  ['club-top-week-v2'],
  { revalidate: 600, tags: ['events', 'club'] }
)

export interface LovedEvent {
  event: CardEvent
  avgRating: number
  reviews: number
}

export const MIN_REVIEWS_FOR_TOP = 3

/** Past events rated by at least 3 members, best average first. */
export const getMembersLovedPast = unstable_cache(
  async (): Promise<LovedEvent[]> => {
    const agg = db
      .select({
        eventId: eventReviews.eventId,
        avg: sql<string>`avg(${eventReviews.rating})`.as('avg'),
        n: sql<number>`count(*)::int`.as('n'),
      })
      .from(eventReviews)
      .groupBy(eventReviews.eventId)
      .having(sql`count(*) >= ${MIN_REVIEWS_FOR_TOP}`)
      .as('agg')
    const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
      tx
        .select({ ...cardColumns, avg: agg.avg, n: agg.n })
        .from(agg)
        .innerJoin(events, eq(events.id, agg.eventId))
        .leftJoin(venues, eq(events.venueId, venues.id))
        .leftJoin(categories, eq(events.categoryId, categories.id))
        .where(and(sql`${events.startDate} < now()`, VISIBLE))
        .orderBy(desc(agg.avg), desc(agg.n), asc(events.id))
        .limit(8)
    )
    return rows.map((r) => ({
      event: toCard(r),
      avgRating: Math.round(Number(r.avg) * 10) / 10,
      reviews: Number(r.n),
    }))
  },
  ['club-loved-past-v1'],
  { revalidate: 1800, tags: ['club'] }
)

/** Distinct event ids a member already swiped (for the Match deck). */
export async function getSwipedIds(userId: string): Promise<string[]> {
  const rows = await db.select({ id: userSwipes.eventId }).from(userSwipes).where(eq(userSwipes.userId, userId)).limit(5000)
  return rows.map((r) => r.id)
}

// ── ADN (taste profile + what the member actually likes) ────────────────────

export interface CategoryShare {
  slug: string
  name: string
  count: number
  percentage: number
}

export interface TasteDna {
  categories: CategoryShare[]
  totalInteractions: number
  profile: {
    archetype: string
    summary: string | null
    scores: Record<'exploration' | 'energy' | 'social' | 'budget' | 'planning' | 'mainstream' | 'visual' | 'depth', number>
    updatedAt: string
  } | null
}

export async function getTasteDna(userId: string): Promise<TasteDna> {
  const [rows, [profile]] = await Promise.all([
    db.execute<{ slug: string; name: string; n: number | string }>(sql`
      select c.slug, c.name, count(*) as n from (
        select event_id from user_saves where user_id = ${userId}
        union all select event_id from user_attendances where user_id = ${userId}
        union all select event_id from event_reviews where user_id = ${userId} and rating >= 3
        union all select event_id from user_swipes where user_id = ${userId} and direction = 'right'
      ) i
      join events e on e.id = i.event_id
      join categories c on c.id = e.category_id
      group by c.slug, c.name
      order by count(*) desc, c.slug
    `),
    db.select().from(tasteProfiles).where(eq(tasteProfiles.userId, userId)).limit(1),
  ])
  const list = [...rows].map((r) => ({ slug: String(r.slug), name: String(r.name), count: Number(r.n) }))
  const total = list.reduce((s, c) => s + c.count, 0)
  return {
    categories: list.map((c) => ({ ...c, percentage: total ? Math.round((c.count / total) * 100) : 0 })),
    totalInteractions: total,
    profile: profile
      ? {
          archetype: profile.archetype,
          summary: profile.aiSummary,
          scores: {
            exploration: profile.exploration,
            energy: profile.energy,
            social: profile.social,
            budget: profile.budget,
            planning: profile.planning,
            mainstream: profile.mainstream,
            visual: profile.visual,
            depth: profile.depth,
          },
          updatedAt: profile.updatedAt.toISOString(),
        }
      : null,
  }
}
