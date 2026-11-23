/**
 * Event selection for Instagram posts — pure functions (tested in select.test.ts).
 *
 * Only events we can vouch for: time known, venue known (Paris or petite
 * couronne), high quality score, not cancelled, no cinema séances, nothing
 * excluded (venue, source, event). Signature venues first, one event per venue,
 * categories mixed.
 */
import { formatPrice, looksCancelled, sourceLabel } from '@/lib/format'
import { formatDayLabel, formatShortDay, formatTime, isLongRun, parisISODate, type TimeWindow } from '@/lib/paris-time'
import { foldText } from '@/lib/events/fold'
import { CATEGORY_BY_SLUG, INSTITUTIONAL_TERMS, OUTING_CATEGORIES } from '@/lib/events/taxonomy'
import { STORY_THEMES, isStoryTheme, type ThemeKey } from './themes'
import type { Candidate, Exclusion, PostItem, PostStatus, WindowKind } from './types'

export const MIN_QUALITY = 70
export const CAROUSEL_EVENTS = 8
export const CAROUSEL_MIN_EVENTS = 5
export const STORY_MAX_EVENTS = 5
export const STORY_MIN_EVENTS = 3
/** Long runs (exhibitions) allowed in a week / weekend carousel. */
const MAX_LONG_RUNS = 2
/** An event shown in a post is not shown again in the following 7 days (any post). */
export const NO_REPEAT_DAYS = 7

// ── Never the same event twice ───────────────────────────────────────────────

/** Normalized title: the same show under several ids (one per date, per source). */
export function titleKey(title: string): string {
  return foldText(title).replace(/[^a-z0-9]+/g, ' ').trim()
}

const keysOf = (id: string | undefined, title: string): string[] => {
  const t = titleKey(title)
  return [...(id ? [`id:${id}`] : []), ...(t.length >= 4 ? [`t:${t}`] : [])]
}

/** Keys of a candidate: its id and its title. */
export function candidateKeys(c: Pick<Candidate, 'id' | 'title'>): string[] {
  return keysOf(c.id, c.title)
}

/** Keys of a slide already planned or published (events only). */
export function itemKeys(it: PostItem): string[] {
  return it.type === 'event' ? keysOf(it.event_id, it.title) : []
}

/** One title inside the other, word for word (« Zinée » and « Zinée — la Cigale »). */
const titlesOverlap = (a: string, b: string) => {
  const ka = ` ${a} `
  const kb = ` ${b} `
  return a.length > 0 && b.length > 0 && (ka.includes(kb) || kb.includes(ka))
}

/**
 * The same show listed twice (two sources, two venue records): one title inside
 * the other, and the same start or the same venue.
 */
export function sameShow(a: Pick<Candidate, 'startDate' | 'title' | 'venueId'>, b: Pick<Candidate, 'startDate' | 'title' | 'venueId'>): boolean {
  if (a.startDate !== b.startDate && (!a.venueId || a.venueId !== b.venueId)) return false
  return titlesOverlap(titleKey(a.title), titleKey(b.title))
}

/** Events already shown or planned: exact keys (id, title) and shows to compare (close titles). */
export interface Shown {
  keys: Set<string>
  shows: { title: string; venueId: string | null; startDate: string | null }[]
}

export function emptyShown(): Shown {
  return { keys: new Set(), shows: [] }
}

/** Add an event picked for a post (its start is known). */
export function addShown(s: Shown, c: Pick<Candidate, 'id' | 'title' | 'venueId' | 'startDate'>): void {
  candidateKeys(c).forEach((k) => s.keys.add(k))
  s.shows.push({ title: titleKey(c.title), venueId: c.venueId, startDate: c.startDate })
}

/** Add the event slides of a stored post (no start date in the slides: compared by venue). */
export function addShownItems(s: Shown, items: PostItem[]): void {
  for (const it of items) {
    if (it.type !== 'event') continue
    itemKeys(it).forEach((k) => s.keys.add(k))
    s.shows.push({ title: titleKey(it.title), venueId: it.venue_id ?? null, startDate: null })
  }
}

/** Already shown: same id, same title, or the same show under a close title (same start or venue). */
export function isShown(c: Candidate, s: Shown): boolean {
  if (candidateKeys(c).some((k) => s.keys.has(k))) return true
  const t = titleKey(c.title)
  return s.shows.some(
    (x) => ((x.startDate != null && x.startDate === c.startDate) || (x.venueId != null && x.venueId === c.venueId)) && titlesOverlap(t, x.title)
  )
}

/**
 * Events not to pick again when preparing `forDate`: those of the posts of the
 * previous NO_REPEAT_DAYS days that are or will be on the account, and those
 * of the same day's posts that this preparation does not rewrite (all of them
 * when `insertOnly`, otherwise everything but drafts).
 */
export function shownBefore(rows: { forDate: string; status: PostStatus; items: PostItem[] }[], forDate: string, fromDate: string, insertOnly: boolean): Shown {
  const out = emptyShown()
  for (const r of rows) {
    if (r.status === 'skipped' || r.status === 'blocked') continue
    const before = r.forDate >= fromDate && r.forDate < forDate
    const sameDayKept = r.forDate === forDate && (insertOnly || r.status !== 'draft')
    if (before || sameDayKept) addShownItems(out, r.items)
  }
  return out
}

const PETITE_COURONNE = /^(92|93|94)\d{3}$/

/** Paris (arrondissement or 75xxx) or petite couronne (92, 93, 94). */
export function inArea(c: Pick<Candidate, 'venueArr' | 'venueZip'>): boolean {
  if (c.venueArr) return true
  const zip = (c.venueZip ?? '').trim()
  return /^75\d{3}$/.test(zip) || PETITE_COURONNE.test(zip)
}

export function isExcluded(c: Candidate, exclusions: Exclusion[]): boolean {
  return exclusions.some((x) => {
    const v = x.value.trim()
    if (x.kind === 'event') return v === c.id || v === c.slug
    if (x.kind === 'source') return v.toLowerCase() === c.source.toLowerCase()
    return v === c.venueId || (c.venueSlug != null && v === c.venueSlug)
  })
}

const institutional = (title: string) => {
  const t = foldText(title)
  return INSTITUTIONAL_TERMS.some((term) => t.includes(term))
}

export interface SelectContext {
  window: WindowKind
  theme: ThemeKey
  timeWindow: TimeWindow
  exclusions: Exclusion[]
  signatureIds: Set<string>
  /** Events already shown or planned (same day, previous days): see shownBefore. */
  avoid?: Shown
}

/** Can this event appear in this post at all? */
export function eligible(c: Candidate, ctx: SelectContext): boolean {
  if (c.status !== 'active' || looksCancelled(c.title, c.shortDesc)) return false
  if (c.categorySlug === 'cinema') return false
  if (!c.venueId || !c.venueName || !inArea(c)) return false
  if (c.qualityScore < MIN_QUALITY) return false
  if (institutional(c.title)) return false
  if (isExcluded(c, ctx.exclusions)) return false
  if (ctx.avoid && isShown(c, ctx.avoid)) return false

  const start = new Date(c.startDate)
  const longRun = isLongRun(c)
  if (longRun) {
    // Exhibitions running for weeks: not « demain » news, except in the Expos story.
    if (ctx.window === 'demain' && ctx.theme !== 'expos') return false
    if (!c.endDate || new Date(c.endDate) < ctx.timeWindow.start) return false
  } else {
    if (!c.timeKnown) return false
    if (start < ctx.timeWindow.start || start > ctx.timeWindow.end) return false
  }
  if (isStoryTheme(ctx.theme) && !STORY_THEMES[ctx.theme].match(c)) return false
  // The feed carousel is the shop window: a photo and a real outing category.
  if (!isStoryTheme(ctx.theme) && (!c.imageUrl || !c.categorySlug)) return false
  return true
}

/** Editorial score: quality, signature venue, photo, popularity, real outings first. */
export function scoreCandidate(c: Candidate, signatureIds: Set<string>): number {
  let s = c.qualityScore
  if (c.venueId && signatureIds.has(c.venueId)) s += 25
  if (c.imageUrl) s += 10
  s += Math.min(c.saveCount * 2, 20)
  if (c.categorySlug && OUTING_CATEGORIES.includes(c.categorySlug)) s += 15
  else if (c.categorySlug === 'soirees' || c.categorySlug === 'festivals' || c.categorySlug === 'visites') s += 5
  if (c.priceStatus === 'unknown') s -= 5
  if (!c.venueArr) s -= 5 // petite couronne after Paris
  if (isLongRun(c)) s -= 8
  // Shows sold by a ticketing site or a venue's own programme are the outings people
  // look for; municipal agendas mix in civic sessions (« lieu de mémoire », ESAT…).
  if (TICKETED_SOURCES.test(c.source)) s += 12
  else if (c.source === 'paris_opendata' || c.source === 'openagenda') s -= 6
  if (CIVIC_TITLE.test(c.title)) s -= 30
  if (c.priceStatus === 'paid') s += 4
  return s
}

/** Sources whose events are shows with tickets or a venue's own programme. */
const TICKETED_SOURCES = /^(ticketmaster|offi|theatreonline|billetreduc|dice|bandsintown|sortiraparis|cinematheque|forumdesimages|parisjazzclub|newmorning|venue_.+)$/

/** Civic / social-service sessions: fine on the site, not « la sortie de demain ». */
const CIVIC_TITLE =
  /\b(m[ée]moire|comm[ée]mor|pand[ée]mie|covid|esat|ladapt|handicap|inauguration|ouverture du|vous accueille|accueil des|bienvenue [àa] paris|permanence|collecte|don du sang|d[ée]pistage|sant[ée] publique|conseil de quartier|visite de chantier)\b/i

/**
 * Greedy pick in score order: never twice the same venue, at most
 * `maxPerCategory` per category and `maxPerDay` per day; relaxed (category and
 * day only, never the venue) when there are not enough events.
 */
export function pickDiverse(
  sorted: Candidate[],
  max: number,
  opts: { maxPerCategory: number; maxPerDay?: number; maxLongRuns?: number }
): Candidate[] {
  const out: Candidate[] = []
  const venues = new Set<string>()
  const titles = new Set<string>()
  const perCat = new Map<string, number>()
  const perDay = new Map<string, number>()
  let longRuns = 0
  const tryPass = (strict: boolean) => {
    for (const c of sorted) {
      if (out.length >= max) return
      if (out.includes(c)) continue
      const venue = c.venueId ?? c.id
      const title = titleKey(c.title)
      if (venues.has(venue) || titles.has(title)) continue
      if (out.some((p) => sameShow(p, c))) continue
      const long = isLongRun(c)
      if (long && opts.maxLongRuns != null && longRuns >= opts.maxLongRuns) continue
      const cat = c.categorySlug ?? 'autre'
      const day = parisISODate(new Date(c.startDate))
      if (strict) {
        if ((perCat.get(cat) ?? 0) >= opts.maxPerCategory) continue
        if (opts.maxPerDay != null && !long && (perDay.get(day) ?? 0) >= opts.maxPerDay) continue
      }
      out.push(c)
      venues.add(venue)
      titles.add(title)
      perCat.set(cat, (perCat.get(cat) ?? 0) + 1)
      if (!long) perDay.set(day, (perDay.get(day) ?? 0) + 1)
      if (long) longRuns++
    }
  }
  tryPass(true)
  tryPass(false)
  return out
}

/** The events of one post, in display order. Empty when there are not enough. */
export function selectEvents(candidates: Candidate[], ctx: SelectContext, kind: 'carousel' | 'story'): Candidate[] {
  const pool = candidates.filter((c) => eligible(c, ctx))
  const sorted = pool
    .map((c) => ({ c, s: scoreCandidate(c, ctx.signatureIds) }))
    .sort((a, b) => b.s - a.s || a.c.startDate.localeCompare(b.c.startDate) || a.c.id.localeCompare(b.c.id))
    .map((x) => x.c)

  if (kind === 'story') {
    const picked = pickDiverse(sorted, STORY_MAX_EVENTS, { maxPerCategory: STORY_MAX_EVENTS, maxLongRuns: ctx.theme === 'expos' ? STORY_MAX_EVENTS : 0 })
    return picked.length >= STORY_MIN_EVENTS ? picked : []
  }
  const multiDay = ctx.window !== 'demain'
  const picked = pickDiverse(sorted, CAROUSEL_EVENTS, {
    maxPerCategory: 2,
    maxPerDay: ctx.window === 'semaine' ? 2 : ctx.window === 'weekend' ? 3 : undefined,
    maxLongRuns: multiDay ? MAX_LONG_RUNS : 0,
  })
  if (picked.length < CAROUSEL_MIN_EVENTS) return []
  // Week and weekend read best in chronological order; « Demain » keeps the best first.
  if (multiDay) return [...picked].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  return picked
}

/** Long runs go last in chronological lists. */
const sortKey = (c: Candidate) => (isLongRun(c) ? 'z' : '') + c.startDate

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** « Mer. 15 oct. · 20h », or « Jusqu’au 12 nov. » for a long run. */
export function slideWhen(c: Pick<Candidate, 'startDate' | 'endDate' | 'timeKnown'>): string {
  // Slides stay short: never the year (the date itself is passed as "now").
  if (isLongRun(c) && c.endDate) {
    const end = new Date(c.endDate)
    return `Jusqu’au ${formatShortDay(end, end).replace(/[\u00a0\u202f]/g, ' ')}`
  }
  const start = new Date(c.startDate)
  // Intl puts narrow no-break spaces in « mer. 15 oct. »: plain spaces render better.
  const day = capitalize(formatDayLabel(start, start)).replace(/[\u00a0\u202f]/g, ' ')
  return c.timeKnown ? `${day} · ${formatTime(start)}` : day
}

export function priceLabel(c: Candidate): string {
  return formatPrice(c).label
}

/** « Lieu · 11e » or « Lieu · Montreuil ». */
export function placeLabel(c: Candidate): string {
  const where = c.venueArr ?? (c.venueCity && c.venueCity !== 'Paris' ? c.venueCity : null)
  return where ? `${c.venueName} · ${where}` : String(c.venueName)
}

/** « Photo : <lieu> (via <source>) ». */
export function creditLine(c: Candidate): string {
  // A venue's own website: the venue is the source, no « via ».
  if (c.source.startsWith('venue_') && c.venueName) return `Photo : ${c.venueName}`
  return `Photo : ${c.venueName ?? sourceLabel(c.source)} (via ${sourceLabel(c.source)})`
}

export function eventItem(c: Candidate): PostItem {
  return {
    type: 'event',
    title: c.title.replace(/\s+/g, ' ').trim(),
    subtitle: placeLabel(c),
    when: slideWhen(c),
    price: priceLabel(c),
    category: c.categorySlug ? (CATEGORY_BY_SLUG[c.categorySlug]?.name ?? null) : null,
    event_id: c.id,
    slug: c.slug,
    venue_id: c.venueId,
    venue_slug: c.venueSlug,
    source: c.source,
    image_url: c.imageUrl,
    image_ok: false,
    credit: c.imageUrl ? creditLine(c) : undefined,
  }
}

export function coverItem(headline: string, dateLabel: string, themeLabel: string): PostItem {
  return { type: 'cover', title: headline, subtitle: dateLabel, when: themeLabel }
}

export function ctaItem(): PostItem {
  return { type: 'cta', title: 'Toutes les sorties sur panameclub.fr' }
}

/** Slides of a post: cover, events, and the final CTA for carousels (≤ 10 images). */
export function buildItems(kind: 'carousel' | 'story', cover: PostItem, picked: Candidate[]): PostItem[] {
  const events = picked.map(eventItem)
  return kind === 'carousel' ? [cover, ...events, ctaItem()].slice(0, 10) : [cover, ...events]
}
