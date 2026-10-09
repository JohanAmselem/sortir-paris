/**
 * "Œuvres": every live date of the same show (same normalised title) across
 * venues, sources and dates — "Cyrano", "Notre-Dame de Paris", a concert tour.
 * Pure helpers (no database), shared by lib/events/works.ts and the pages.
 */
import { filmSlug } from './fold'

/** Categories grouped into works. Cinema has its own pages (/films/[slug]). */
export const WORK_CATEGORIES = ['theatre', 'spectacles', 'danse', 'concerts', 'expos'] as const

/** Same key as films: "Cyrano de Bergerac" → "cyrano-de-bergerac". */
export const workSlug = filmSlug

export const WORK_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * LIKE pattern on the folded event text that every row of the work matches:
 * the slug's words appear in that order in the folded title. Lets Postgres use
 * the trigram index (idx_events_search_trgm) before the exact key check.
 */
export function workLikePattern(slug: string): string {
  return '%' + slug.split('-').filter(Boolean).join('%') + '%'
}

/**
 * Titles that name a kind of outing, not a work: grouping them would mix
 * unrelated events ("Concert", "Visite guidée", "Jam session"…).
 */
const GENERIC_WORDS = new Set(
  (
    'concert concerts recital spectacle spectacles exposition expo visite visites guidee guidees commentee conference rencontre ' +
    'atelier ateliers soiree soirees jam session sessions bal dj set live showcase cours stage projection lecture lectures ' +
    'theatre danse impro improvisation humour stand up comedy club open mic scene ouverte blind test quiz karaoke ' +
    'nocturne vernissage finissage festival apero brunch messe office vepres orgue piano jazz chorale choeur musique ' +
    'de du des la le les l d a au aux et en pour avec sur the of and'
  ).split(' ')
)

/** True when the slug only contains generic words ("concert-de-jazz", "visite-guidee"). */
export function isGenericWorkSlug(slug: string): boolean {
  const words = slug.split('-').filter(Boolean)
  if (!words.length) return true
  if (words.every((w) => GENERIC_WORDS.has(w) || /^\d+$/.test(w))) return true
  // The trigram index needs at least one word of 3+ characters.
  return !words.some((w) => w.length >= 3)
}

export interface WorkDate {
  id: string
  slug: string
  startDate: string
  endDate: string | null
  timeKnown: boolean
  priceMin: number
  priceMax: number
  priceStatus: 'free' | 'paid' | 'unknown'
  isFree: boolean
  bookingUrl: string | null
  sourceUrl: string | null
  source: string
}

export interface WorkVenueGroup<V, D extends WorkDate = WorkDate> {
  key: string
  venue: V | null
  dates: D[]
  /** Lowest and highest known price over the dates, in cents (paid only). */
  priceMin: number
  priceMax: number
  anyFree: boolean
  /** Booking (or source) link of the next date at this venue. */
  bookingUrl: string | null
}

/**
 * Dates grouped by venue: venues in the order of their next date, dates
 * soonest first inside each venue.
 */
export function groupWorkByVenue<V extends { slug: string }, D extends WorkDate>(
  rows: Array<D & { venue: V | null }>
): Array<WorkVenueGroup<V, D>> {
  const sorted = [...rows].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id))
  const groups = new Map<string, WorkVenueGroup<V, D>>()
  for (const r of sorted) {
    const key = r.venue?.slug ?? `sans-lieu`
    let g = groups.get(key)
    if (!g) {
      g = { key, venue: r.venue, dates: [], priceMin: 0, priceMax: 0, anyFree: false, bookingUrl: null }
      groups.set(key, g)
    }
    g.dates.push(r)
    if (r.priceStatus === 'free') g.anyFree = true
    if (r.priceStatus === 'paid') {
      const lo = Math.min(r.priceMin || r.priceMax, r.priceMax || r.priceMin)
      const hi = Math.max(r.priceMin, r.priceMax)
      if (lo > 0) g.priceMin = g.priceMin ? Math.min(g.priceMin, lo) : lo
      g.priceMax = Math.max(g.priceMax, hi)
    }
    g.bookingUrl ??= r.bookingUrl || r.sourceUrl || null
  }
  return [...groups.values()]
}

/** Row used to pick the title, picture and text of the work. */
export interface WorkQualityRow {
  title: string
  imageUrl: string | null
  description: string | null
  shortDesc: string | null
  qualityScore: number
}

/** Best picture: from the highest-quality row that has one. */
export function bestWorkImage(rows: WorkQualityRow[]): string | null {
  return [...rows].filter((r) => r.imageUrl).sort((a, b) => b.qualityScore - a.qualityScore)[0]?.imageUrl ?? null
}

/** Best text: the highest-quality row with a real description (else a short one). */
export function bestWorkText(rows: WorkQualityRow[]): string | null {
  const byQuality = [...rows].sort((a, b) => b.qualityScore - a.qualityScore)
  const long = byQuality.find((r) => (r.description ?? '').trim().length >= 80)
  if (long) return long.description!.trim()
  return byQuality.find((r) => r.shortDesc?.trim())?.shortDesc!.trim() ?? byQuality.find((r) => r.description?.trim())?.description!.trim() ?? null
}

/** Display title: the most common spelling, ties to the highest quality. */
export function bestWorkTitle(rows: WorkQualityRow[]): string | null {
  const counts = new Map<string, { n: number; q: number }>()
  for (const r of rows) {
    const c = counts.get(r.title) ?? { n: 0, q: -Infinity }
    counts.set(r.title, { n: c.n + 1, q: Math.max(c.q, r.qualityScore) })
  }
  return [...counts.entries()].sort((a, b) => b[1].n - a[1].n || b[1].q - a[1].q)[0]?.[0] ?? null
}
