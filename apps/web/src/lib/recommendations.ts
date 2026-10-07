/**
 * Personal recommendations: turns what we know about someone (quiz profile,
 * onboarding preferences, saves, outings, swipes, reviews) into an EventQuery
 * plus the "why" shown on each pick.
 *
 *   getPersonalQuery(userId | null, signals) → PersonalPlan (query + ranking hints)
 *   getPersonalPicks({...})                   → CardEvent[] with `reason`
 *
 * Used by the weekly Drop (/drop, /api/drop) and the « Pour toi » section.
 * The plan building is pure (buildPersonalPlan / explainPick, unit-tested in
 * recommendations.test.ts); only loadSignals touches the database.
 */
import 'server-only'
import { z } from 'zod'
import { and, eq, gte, inArray, lte, or, sql } from 'drizzle-orm'
import {
  db,
  categories as categoriesTable,
  eventReviews,
  events,
  tasteProfiles,
  userAttendances,
  userPreferences,
  userSaves,
  userSwipes,
} from '@sortir/db'
import { safeQueryEvents, diversify } from '@/lib/events/query'
import { ARRONDISSEMENTS, CATEGORY_BY_SLUG, INTENT_BY_SLUG, normalizeArrondissement } from '@/lib/events/taxonomy'
import { ARCHETYPES, ARCHETYPE_AFFINITIES, DIMENSIONS, type TasteScores } from '@/lib/taste-quiz-data'
import type { CardEvent, EventQuery } from '@/lib/events/types'

// ── Signals ───────────────────────────────────────────────────────────────

export interface PersonalSignals {
  /** Explicit category slugs (onboarding / settings). */
  categories?: string[]
  /** Explicit intent slugs (onboarding "ambiances"). */
  intents?: string[]
  arrondissements?: string[]
  prefFree?: boolean
  /** Category slug → number of positive interactions (saves, outings, right swipes, good reviews). */
  liked?: Record<string, number>
  /** Category slug → number of negative interactions (left swipes, bad reviews). */
  disliked?: Record<string, number>
  scores?: Partial<TasteScores> | null
  archetype?: string | null
  /** Events the person already knows (saved, swiped, attended). */
  excludeIds?: string[]
}

/** Signals an anonymous visitor can send from localStorage (quiz result, local swipes). */
export const clientSignalsSchema = z
  .object({
    archetype: z
      .string()
      .max(40)
      .refine((s) => s in ARCHETYPES)
      .nullish(),
    scores: z.partialRecord(z.enum(DIMENSIONS), z.number().min(0).max(100)).nullish(),
    liked: z.record(z.string().max(30), z.number().int().min(0).max(100)).optional(),
    disliked: z.record(z.string().max(30), z.number().int().min(0).max(100)).optional(),
    excludeIds: z.array(z.guid()).max(300).optional(),
  })
  .strict()

export type ClientSignals = z.infer<typeof clientSignalsSchema>

export function clientToSignals(c: ClientSignals | null | undefined): PersonalSignals {
  if (!c) return {}
  return {
    archetype: c.archetype ?? null,
    scores: c.scores ?? null,
    liked: c.liked,
    disliked: c.disliked,
    excludeIds: c.excludeIds,
  }
}

function addCounts(a: Record<string, number> = {}, b: Record<string, number> = {}): Record<string, number> {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v
  return out
}

/** Server-known signals win for explicit preferences; interaction counts add up. */
export function mergeSignals(base: PersonalSignals, extra: PersonalSignals): PersonalSignals {
  return {
    categories: base.categories?.length ? base.categories : extra.categories,
    intents: base.intents?.length ? base.intents : extra.intents,
    arrondissements: base.arrondissements?.length ? base.arrondissements : extra.arrondissements,
    prefFree: base.prefFree ?? extra.prefFree,
    liked: addCounts(base.liked, extra.liked),
    disliked: addCounts(base.disliked, extra.disliked),
    scores: base.scores ?? extra.scores ?? null,
    archetype: base.archetype ?? extra.archetype ?? null,
    excludeIds: [...new Set([...(base.excludeIds ?? []), ...(extra.excludeIds ?? [])])],
  }
}

// ── Plan (pure) ───────────────────────────────────────────────────────────

export type Budget = 'free' | 'cheap' | 'any'

export interface PersonalPlan {
  /** False when we know nothing: callers show generic picks + a CTA. */
  personalized: boolean
  /** Ranked preferred category slugs (max 3). */
  categories: string[]
  /** Ranked intent slugs (max 2). */
  intents: string[]
  arrondissements: string[]
  budget: Budget
  archetype: string | null
  excludeIds: string[]
  /** Main query: preferred categories + budget (+ the caller's base: window, limit…). */
  query: EventQuery
}

const CHEAP_MAX_EUROS = 20

export function buildPersonalPlan(signals: PersonalSignals, base: EventQuery = {}): PersonalPlan {
  const archetype = signals.archetype && signals.archetype in ARCHETYPES ? signals.archetype : null
  const affinity = archetype ? ARCHETYPE_AFFINITIES[archetype] : null
  const scores = signals.scores ?? {}

  // Categories
  const cat: Record<string, number> = {}
  const bump = (slug: string, w: number) => {
    if (CATEGORY_BY_SLUG[slug]) cat[slug] = (cat[slug] ?? 0) + w
  }
  for (const s of signals.categories ?? []) bump(s, 3)
  for (const [s, count] of Object.entries(signals.liked ?? {})) bump(s, Math.min(count, 5))
  affinity?.categories.forEach((s, i) => bump(s, 2.5 - i * 0.5))
  for (const [s, count] of Object.entries(signals.disliked ?? {})) bump(s, -Math.min(count, 5) * 0.7)
  const categories = Object.entries(cat)
    .filter(([, w]) => w >= 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([s]) => s)

  // Intents
  const intent: Record<string, number> = {}
  const push = (slug: string, w: number) => {
    if (INTENT_BY_SLUG[slug]) intent[slug] = (intent[slug] ?? 0) + w
  }
  for (const s of signals.intents ?? []) push(s, 3)
  affinity?.intents.forEach((s, i) => push(s, 2 - i * 0.5))
  const sc = (d: keyof TasteScores) => scores[d]
  if ((sc('energy') ?? 50) >= 65) push('festif', 1.5)
  if ((sc('energy') ?? 50) <= 35) push('chill', 1.5)
  if ((sc('social') ?? 50) >= 70) push('entre-amis', 1)
  if ((sc('exploration') ?? 50) >= 65) push('insolite', 1.5)
  if ((sc('depth') ?? 50) >= 65) push('culture-pointue', 1.5)
  const intents = Object.entries(intent)
    .filter(([, w]) => w >= 1.5)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([s]) => s)

  const budget: Budget = signals.prefFree ? 'free' : (sc('budget') ?? 50) <= 30 ? 'cheap' : 'any'

  const arrondissements = [
    ...new Set((signals.arrondissements ?? []).map((a) => normalizeArrondissement(a)).filter((a): a is string => !!a)),
  ].filter((a) => ARRONDISSEMENTS.includes(a))

  const excludeIds = [...new Set(signals.excludeIds ?? [])]

  const query: EventQuery = { ...base }
  if (categories.length) query.categories = categories
  if (budget === 'free') query.maxPrice = 0
  else if (budget === 'cheap') query.maxPrice = CHEAP_MAX_EUROS
  if (excludeIds.length) query.excludeIds = excludeIds

  return {
    personalized: categories.length > 0 || intents.length > 0 || budget !== 'any' || arrondissements.length > 0,
    categories,
    intents,
    arrondissements,
    budget,
    archetype,
    excludeIds,
    query,
  }
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** Short French "why" for a pick. `intentIds`: events that matched the plan's top intent. */
export function explainPick(e: CardEvent, plan: PersonalPlan, ctx: { intentIds?: Set<string> } = {}): string {
  const free = e.priceStatus === 'free' || e.isFree
  const arr = e.venue?.arrondissement ?? null
  if (plan.personalized) {
    if (ctx.intentIds?.has(e.id) && plan.intents[0]) {
      const meta = INTENT_BY_SLUG[plan.intents[0]]
      if (meta) return `${meta.reason.charAt(0).toUpperCase()}${meta.reason.slice(1)}, ton style`
    }
    if (e.category && plan.categories.includes(e.category.slug)) {
      const meta = CATEGORY_BY_SLUG[e.category.slug]
      return `Parce que tu aimes ${meta ? lower(meta.plural) : lower(e.category.name)}`
    }
    if (arr && plan.arrondissements.includes(arr)) return `Dans ton coin (${arr})`
    if (free && plan.budget !== 'any') return 'Gratuit, comme tu préfères'
  }
  if (e.saveCount >= 3) return `Gardé par ${e.saveCount} membres`
  if (free) return 'Gratuit cette semaine'
  if (plan.personalized) return 'Pour sortir de tes habitudes'
  return 'Une valeur sûre de la semaine'
}

/**
 * Merge candidate lists into a ranking. Earlier lists win ties; events found
 * by several lists get a boost; preferred categories / arrondissements too.
 */
export function rankCandidates(lists: CardEvent[][], plan: PersonalPlan): CardEvent[] {
  const exclude = new Set(plan.excludeIds)
  const score = new Map<string, number>()
  const byId = new Map<string, CardEvent>()
  lists.forEach((list, li) => {
    list.forEach((e, i) => {
      if (exclude.has(e.id)) return
      byId.set(e.id, e)
      const positional = Math.max(0, 40 - i) / 40 // 1 → 0 down the list
      const listWeight = 1 / (li + 1)
      score.set(e.id, (score.get(e.id) ?? 0) + positional * listWeight + 0.25)
    })
  })
  for (const [id, e] of byId) {
    let s = score.get(id) ?? 0
    const ci = e.category ? plan.categories.indexOf(e.category.slug) : -1
    if (ci >= 0) s += 0.6 - ci * 0.15
    if (e.venue?.arrondissement && plan.arrondissements.includes(e.venue.arrondissement)) s += 0.3
    if (plan.budget !== 'any' && (e.priceStatus === 'free' || e.isFree)) s += 0.2
    if (!e.imageUrl) s -= 0.5
    score.set(id, s)
  }
  return [...byId.values()].sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) || a.id.localeCompare(b.id))
}

// ── Database ──────────────────────────────────────────────────────────────

async function safe<T>(p: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await p
  } catch (err) {
    console.error(`[recommendations] ${label} failed`, err)
    return fallback
  }
}

type CatCount = { slug: string | null; n: number }
const toCounts = (rows: CatCount[]) => {
  const out: Record<string, number> = {}
  for (const r of rows) if (r.slug) out[r.slug] = (out[r.slug] ?? 0) + Number(r.n)
  return out
}

async function categoryCounts(eventIds: string[]): Promise<Record<string, number>> {
  if (!eventIds.length) return {}
  const rows = await db
    .select({ slug: categoriesTable.slug, n: sql<number>`count(*)::int` })
    .from(events)
    .innerJoin(categoriesTable, eq(events.categoryId, categoriesTable.id))
    .where(inArray(events.id, eventIds.slice(0, 500)))
    .groupBy(categoriesTable.slug)
  return toCounts(rows)
}

/** Everything we know about a member. Never throws (each source degrades to empty). */
export async function loadSignals(userId: string): Promise<PersonalSignals> {
  const [prefs, profile, saves, attendances, swipes, reviews] = await Promise.all([
    safe(db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1), [], 'prefs'),
    safe(db.select().from(tasteProfiles).where(eq(tasteProfiles.userId, userId)).limit(1), [], 'profile'),
    safe(db.select({ id: userSaves.eventId }).from(userSaves).where(eq(userSaves.userId, userId)).limit(500), [], 'saves'),
    safe(
      db.select({ id: userAttendances.eventId }).from(userAttendances).where(eq(userAttendances.userId, userId)).limit(500),
      [],
      'attendances'
    ),
    safe(
      db
        .select({ id: userSwipes.eventId, direction: userSwipes.direction })
        .from(userSwipes)
        .where(eq(userSwipes.userId, userId))
        .limit(1000),
      [],
      'swipes'
    ),
    safe(
      db
        .select({ id: eventReviews.eventId, rating: eventReviews.rating })
        .from(eventReviews)
        .where(and(eq(eventReviews.userId, userId), or(gte(eventReviews.rating, 4), lte(eventReviews.rating, 2))))
        .limit(500),
      [],
      'reviews'
    ),
  ])

  const likedIds = [
    ...saves.map((r) => r.id),
    ...attendances.map((r) => r.id),
    ...swipes.filter((s) => s.direction === 'right').map((s) => s.id),
    ...reviews.filter((r) => r.rating >= 4).map((r) => r.id),
  ]
  const dislikedIds = [
    ...swipes.filter((s) => s.direction === 'left').map((s) => s.id),
    ...reviews.filter((r) => r.rating <= 2).map((r) => r.id),
  ]
  const [liked, disliked] = await Promise.all([
    safe(categoryCounts(likedIds), {}, 'liked'),
    safe(categoryCounts(dislikedIds), {}, 'disliked'),
  ])

  const p = prefs[0]
  const t = profile[0]
  return {
    categories: p?.categories ?? [],
    intents: p?.ambiances ?? [],
    arrondissements: p?.zones ?? [],
    prefFree: p?.prefFree ?? false,
    liked,
    disliked,
    scores: t
      ? {
          exploration: t.exploration,
          energy: t.energy,
          social: t.social,
          budget: t.budget,
          planning: t.planning,
          mainstream: t.mainstream,
          visual: t.visual,
          depth: t.depth,
        }
      : null,
    archetype: t?.archetype ?? null,
    excludeIds: [...new Set([...saves.map((r) => r.id), ...attendances.map((r) => r.id), ...swipes.map((s) => s.id)])],
  }
}

/** Personal EventQuery for a member (userId) and/or client-side signals (anonymous). */
export async function getPersonalQuery(
  userId: string | null,
  signals: PersonalSignals = {},
  base: EventQuery = {}
): Promise<PersonalPlan> {
  const known = userId ? await loadSignals(userId) : {}
  return buildPersonalPlan(mergeSignals(known, signals), base)
}

export interface PersonalPicks {
  events: CardEvent[]
  plan: PersonalPlan
  /** True when every query failed (show DataUnavailable). */
  error: boolean
}

/**
 * Ranked, diversified picks with a `reason` each.
 * Queries go through the cached data layer; exclusions are applied here so
 * the cache keys stay shared between members.
 */
export async function getPersonalPicks(opts: {
  userId: string | null
  signals?: PersonalSignals
  when?: string
  limit?: number
  /** Extra ids to skip (e.g. already shown on the page). */
  excludeIds?: string[]
}): Promise<PersonalPicks> {
  const limit = opts.limit ?? 5
  const base: EventQuery = { when: opts.when ?? 'week', withImage: true }
  const plan = await getPersonalQuery(opts.userId, { ...opts.signals, excludeIds: [...(opts.signals?.excludeIds ?? []), ...(opts.excludeIds ?? [])] }, base)
  const mainQuery: EventQuery = { ...plan.query }
  delete mainQuery.excludeIds

  const [main, byIntent, byZone, generic] = await Promise.all([
    plan.categories.length || plan.budget !== 'any' ? safeQueryEvents({ ...mainQuery, limit: 40 }) : null,
    plan.intents[0]
      ? safeQueryEvents({ ...base, intents: [plan.intents[0]], maxPrice: mainQuery.maxPrice, limit: 20 })
      : null,
    plan.arrondissements.length ? safeQueryEvents({ ...base, arrondissements: plan.arrondissements, limit: 20 }) : null,
    safeQueryEvents({ ...base, limit: 40 }),
  ])

  const lists = [main, byIntent, byZone, generic].filter((x): x is NonNullable<typeof x> => !!x)
  const error = lists.every((l) => l.error)
  const intentIds = new Set((byIntent?.events ?? []).map((e) => e.id))
  const ranked = rankCandidates(
    lists.map((l) => l.events),
    plan
  )
  const picked = diversify(ranked, limit).map((e) => ({ ...e, reason: explainPick(e, plan, { intentIds }) }))
  return { events: picked, plan, error }
}
