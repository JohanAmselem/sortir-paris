/**
 * From an intent to a short list of strong suggestions, each with a "why".
 * Never returns an empty list silently: relaxes constraints step by step and
 * says which one was relaxed.
 */
import 'server-only'
import { diversify, safeQueryEvents } from '@/lib/events/query'
import { CATEGORY_BY_SLUG, INTENT_BY_SLUG } from '@/lib/events/taxonomy'
import type { CardEvent, EventQuery } from '@/lib/events/types'
import { formatPrice } from '@/lib/format'
import type { OutingIntent } from './intent-rules'

export interface Recommendation {
  events: CardEvent[]
  total: number
  /** Human note when constraints had to be relaxed. */
  relaxed: string | null
  query: EventQuery
}

export function intentToQuery(i: OutingIntent, near?: { lat: number; lng: number } | null): EventQuery {
  return {
    when: i.date ?? i.when ?? 'week',
    categories: i.categories,
    arrondissements: i.arrondissements,
    free: i.free,
    maxPrice: i.free ? null : i.maxPrice,
    intents: i.intents,
    q: i.keywords.length ? i.keywords.join(' ') : null,
    near: i.nearMe && near ? { ...near, radiusKm: 2.5 } : null,
  }
}

const RELAX_STEPS: Array<{ note: string; apply: (q: EventQuery) => EventQuery | null }> = [
  { note: 'sans le mot-clé exact', apply: (q) => (q.q ? { ...q, q: null } : null) },
  { note: 'avec un rayon plus large', apply: (q) => (q.near ? { ...q, near: { ...q.near, radiusKm: 6 } } : null) },
  { note: 'dans les arrondissements voisins', apply: (q) => (q.arrondissements?.length ? { ...q, arrondissements: [] } : null) },
  { note: 'sans le filtre d’ambiance', apply: (q) => (q.intents?.length ? { ...q, intents: [] } : null) },
  { note: 'sur toute la semaine', apply: (q) => (q.when && q.when !== 'week' && q.when !== 'month' ? { ...q, when: 'week' } : null) },
  { note: 'toutes catégories', apply: (q) => (q.categories?.length ? { ...q, categories: [] } : null) },
]

export async function recommend(base: EventQuery, limit = 6): Promise<Recommendation> {
  let query: EventQuery = { ...base, limit: limit * 3, sort: base.near ? 'distance' : 'relevance' }
  const notes: string[] = []
  let page = await safeQueryEvents(query)

  for (const step of RELAX_STEPS) {
    if (page.events.length >= Math.min(3, limit)) break
    const next = step.apply(query)
    if (!next) continue
    query = next
    notes.push(step.note)
    page = await safeQueryEvents(query)
  }

  const events = diversify(page.events, limit).map((e) => ({ ...e, reason: explain(e, base) }))
  return {
    events,
    total: page.total,
    relaxed: notes.length ? `Peu de résultats exacts : on a élargi ${notes.join(', ')}.` : null,
    query,
  }
}

/** One short, honest reason built only from facts we know. */
export function explain(e: CardEvent, q: EventQuery): string {
  const bits: string[] = []
  if (e.distanceKm != null && e.distanceKm < 3) bits.push(`à ${e.distanceKm < 1 ? Math.round(e.distanceKm * 1000) + ' m' : e.distanceKm.toString().replace('.', ',') + ' km'}`)
  else if (q.arrondissements?.length && e.venue?.arrondissement && q.arrondissements.includes(e.venue.arrondissement))
    bits.push(`dans le ${e.venue.arrondissement}`)
  const intent = q.intents?.[0] ? INTENT_BY_SLUG[q.intents[0]] : null
  if (intent) bits.push(intent.reason)
  const price = formatPrice(e)
  if (q.free && price.tone === 'free') bits.push('gratuit')
  else if (q.maxPrice != null && price.tone === 'paid') bits.push(`dans ton budget (${price.label})`)
  if (!bits.length && e.category && q.categories?.includes(e.category.slug)) bits.push(CATEGORY_BY_SLUG[e.category.slug]?.name.toLowerCase() ?? e.category.name)
  if (!bits.length && e.saveCount >= 3) bits.push(`sauvegardé ${e.saveCount} fois`)
  if (!bits.length) return ''
  const s = bits.join(', ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
