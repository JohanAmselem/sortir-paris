/**
 * Home of the redesign (site + app 2.0): 6 blocks instead of 11.
 *   Notre choix (window: ce soir / demain / ce week-end) · Par envie ·
 *   Ce week-end · Les grosses dates · Expos du moment.
 */
import 'server-only'
import { bucketNow, diversify, safeQueryEvents } from '@/lib/events/query'
import { buildEventParams } from '@/lib/events/params'
import { foldText } from '@/lib/events/fold'
import { withReasons } from '@/lib/events/reasons'
import { getWindow, nextMonthKeys } from '@/lib/paris-time'
import type { EnvieTile, HomeV2Response, HomeWhen } from '@/lib/api-v2/contract'
import type { CardEvent, EventQuery } from '@/lib/events/types'

export const HOME_WHENS: HomeWhen[] = ['tonight', 'tomorrow', 'weekend']

const ENVIES: Array<Omit<EnvieTile, 'imageUrl'> & { query: EventQuery }> = [
  { slug: 'concerts', label: 'Concerts', query: { categories: ['concerts'] }, params: '' },
  { slug: 'scene', label: 'Théâtre & humour', query: { categories: ['theatre', 'spectacles'] }, params: '' },
  { slug: 'expos', label: 'Expos', query: { categories: ['expos'] }, params: '' },
  { slug: 'soirees', label: 'Soirées', query: { categories: ['soirees'] }, params: '' },
  { slug: 'famille', label: 'En famille', query: { intents: ['en-famille'] }, params: '' },
  { slug: 'gratuit', label: 'Gratuit', query: { free: true }, params: '' },
]

/** Big concerts and shows in the "lieux phares", for the months people book ahead. */
const BIG_DATES_MONTHS = 6
const BIG_DATES_CATEGORIES = ['concerts', 'spectacles', 'festivals']

/** Size of the hall: arenas and stadiums first, then the big concert halls. */
const ARENAS = /accor ?arena|bercy|defense arena|adidas arena|arena porte de la chapelle|stade de france|zenith|parc des princes|seine musicale|palais des congres|dome de paris|^(l.)?olympia/
const BIG_HALLS = /casino de paris|folies bergere|grand rex|bataclan|cigale|trianon|elysee montmartre|salle pleyel|philharmonie|chatelet|opera|alhambra|bobino|theatre de paris|palais des sports|salle gaveau/

export function hallTier(venueName: string | null | undefined): number {
  const v = foldText(venueName ?? '')
  if (ARENAS.test(v)) return 3
  if (BIG_HALLS.test(v)) return 2
  return 1
}

/**
 * Round-robin over the months (biggest halls first within a month, then newly
 * announced dates), so the block reaches far ahead instead of filling up with
 * next week. Shown in date order.
 */
export function spreadOverMonths(perMonth: CardEvent[][], max: number): CardEvent[] {
  const rank = (e: CardEvent) => hallTier(e.venue?.name) * 2 + Number(Boolean(e.isNew))
  const queues = perMonth.map((list) => [...list].sort((a, b) => rank(b) - rank(a)))
  const out: CardEvent[] = []
  const seen = new Set<string>()
  for (let round = 0; out.length < max && queues.some((q) => q.length); round++) {
    for (const q of queues) {
      while (q.length) {
        const e = q.shift()!
        const key = e.title.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(e)
        break
      }
      if (out.length >= max) break
    }
  }
  return out.sort((a, b) => a.startDate.localeCompare(b.startDate))
}

export async function getHomeV2(when: HomeWhen, near: { lat: number; lng: number } | null = null): Promise<HomeV2Response> {
  const now = bucketNow()
  const base: EventQuery = { withImage: true, oneOffOnly: true, excludeCategories: ['cinema'] }
  const nearQ = near ? { near: { ...near, radiusKm: 3 } } : {}

  // Next months, from the one after the current month.
  const bigMonths = nextMonthKeys(BIG_DATES_MONTHS + 1, now).slice(1)
  const bigBase: EventQuery = { ...base, signatureOnly: true, categories: BIG_DATES_CATEGORIES, excludeCategories: [], limit: 30 }
  const [picksPage, countPage, weekendPage, exposPage, envies, bigPages] = await Promise.all([
    safeQueryEvents({ ...base, ...nearQ, when, limit: 30 }),
    safeQueryEvents({ when, oneOffOnly: true, limit: 1 }),
    safeQueryEvents({ ...base, when: 'weekend', limit: 30 }),
    safeQueryEvents({ categories: ['expos'], when: 'month', runsEndingWithinDays: 400, withImage: true, limit: 12 }),
    Promise.all(ENVIES.map((e) => safeQueryEvents({ ...e.query, withImage: true, when: 'week', limit: 1 }))),
    Promise.all(bigMonths.map((m) => safeQueryEvents({ ...bigBase, when: m }))),
  ])

  const picks = withReasons(diversify(picksPage.events, 5), now)
  const shown = new Set(picks.map((e) => e.id))
  const weekend = diversify(weekendPage.events.filter((e) => !shown.has(e.id)), 10)
  const bigDates = spreadOverMonths(
    bigPages.map((p) => p.events.filter((e) => e.priceStatus !== 'free')),
    12
  )

  return {
    generatedAt: now.toISOString(),
    when,
    whenLabel: getWindow(when, now).label,
    count: countPage.total,
    picks,
    envies: ENVIES.map((e, i) => ({
      slug: e.slug,
      label: e.label,
      params: buildEventParams(e.query).toString(),
      imageUrl: envies[i]?.events[0]?.imageUrl ?? null,
    })),
    weekend,
    bigDates,
    expos: diversify(exposPage.events, 8),
  }
}
