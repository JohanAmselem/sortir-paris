/**
 * URL <-> EventQuery. One scheme for every listing page, so filters survive
 * navigation, sharing and the back button.
 *   ?when=tonight&cat=concerts,theatre&arr=11e&free=1&max=20&mood=entre-amis&q=jazz&lat=..&lng=..&sort=soon
 * Legacy params (date, category, ambiance) are still understood.
 */
import { CATEGORY_BY_SLUG, INTENT_BY_SLUG, TOPIC_RULES, normalizeArrondissement } from './taxonomy'
import { extractSearchFilters } from './search-synonyms'
import type { EventQuery, SortKey } from './types'

type Params = Record<string, string | string[] | undefined> | URLSearchParams

function get(p: Params, key: string): string | undefined {
  if (p instanceof URLSearchParams) return p.get(key) ?? undefined
  const v = p[key]
  return Array.isArray(v) ? v[0] : v
}

const csv = (v: string | undefined) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])

const SORTS: SortKey[] = ['relevance', 'soon', 'popular', 'distance', 'ending']

export function parseEventParams(p: Params): EventQuery {
  const when = get(p, 'when') ?? get(p, 'date') ?? null
  const categories = [...csv(get(p, 'cat')), ...csv(get(p, 'category'))].filter((c) => c in CATEGORY_BY_SLUG)
  const arrondissements = csv(get(p, 'arr'))
    .map((a) => normalizeArrondissement(a))
    .filter((a): a is string => Boolean(a))
  const intents = [...csv(get(p, 'mood')), ...csv(get(p, 'ambiance'))].filter((i) => i in INTENT_BY_SLUG)
  const max = Number(get(p, 'max'))
  const lat = Number(get(p, 'lat'))
  const lng = Number(get(p, 'lng'))
  const near =
    Number.isFinite(lat) && Number.isFinite(lng) && lat > 48.5 && lat < 49.2 && lng > 1.9 && lng < 2.9
      ? { lat, lng, radiusKm: Math.min(Math.max(Number(get(p, 'radius')) || 2.5, 0.5), 15) }
      : null
  const sort = get(p, 'sort') as SortKey | undefined
  let q = get(p, 'q')?.trim().slice(0, 120) || null
  const topics = csv(get(p, 'topic')).filter((t) => t in TOPIC_RULES)
  let free = get(p, 'free') === '1' || get(p, 'free') === 'true'
  // "expo gratuite", "stand up", "enfants" → filters (unless the exact text is asked for).
  if (q && get(p, 'raw') !== '1') {
    const found = extractSearchFilters(q)
    q = found.q
    categories.push(...found.categories)
    intents.push(...found.intents)
    topics.push(...found.topics)
    free ||= found.free
  }
  const excludeCategories = csv(get(p, 'xcat')).filter((c) => c in CATEGORY_BY_SLUG)
  return {
    when,
    categories: [...new Set(categories)].slice(0, 4),
    arrondissements: [...new Set(arrondissements)].slice(0, 6),
    intents: [...new Set(intents)].slice(0, 3),
    topics: [...new Set(topics)].slice(0, 2),
    excludeCategories: [...new Set(excludeCategories)].slice(0, 4),
    free,
    maxPrice: Number.isFinite(max) && max > 0 ? Math.min(max, 500) : null,
    near,
    q,
    sort: sort && SORTS.includes(sort) ? sort : undefined,
    runsEndingWithinDays: Number(get(p, 'runs')) > 0 ? Math.min(Number(get(p, 'runs')), 400) : null,
  }
}

export function buildEventParams(q: EventQuery): URLSearchParams {
  const s = new URLSearchParams()
  if (q.when) s.set('when', q.when)
  if (q.categories?.length) s.set('cat', q.categories.join(','))
  if (q.arrondissements?.length) s.set('arr', q.arrondissements.join(','))
  if (q.intents?.length) s.set('mood', q.intents.join(','))
  if (q.topics?.length) s.set('topic', q.topics.join(','))
  if (q.excludeCategories?.length) s.set('xcat', q.excludeCategories.join(','))
  if (q.free) s.set('free', '1')
  if (q.maxPrice != null && !q.free) s.set('max', String(q.maxPrice))
  if (q.q) s.set('q', q.q)
  if (q.near) {
    s.set('lat', q.near.lat.toFixed(4))
    s.set('lng', q.near.lng.toFixed(4))
  }
  if (q.sort && q.sort !== 'relevance') s.set('sort', q.sort)
  if (q.runsEndingWithinDays) s.set('runs', String(q.runsEndingWithinDays))
  return s
}

export function eventsHref(q: EventQuery, path = '/evenements'): string {
  const s = buildEventParams(q).toString()
  return s ? `${path}?${s}` : path
}

/** Number of active filters (for the "Filtres (3)" button). */
export function countFilters(q: EventQuery): number {
  return (
    Number(Boolean(q.when)) +
    (q.categories?.length ?? 0) +
    (q.arrondissements?.length ?? 0) +
    (q.intents?.length ?? 0) +
    (q.topics?.length ?? 0) +
    Number(Boolean(q.free)) +
    Number(q.maxPrice != null) +
    Number(Boolean(q.near))
  )
}
