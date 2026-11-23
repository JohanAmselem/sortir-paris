/**
 * The Agenda: one listing for "everything to come", sorted by date, with the
 * month and day counters, the long runs shown apart, and — when the person typed
 * something — the matching artists and venues. Used by /agenda (site) and
 * /api/v2/agenda (app 2.0).
 */
import 'server-only'
import { suggestArtists } from '@/lib/member/artists'
import { getSuggestions } from '@/lib/events/suggest'
import { getDayCounts, getMonthCounts } from '@/lib/events/calendar'
import { parseEventParams } from '@/lib/events/params'
import { safeQueryEvents } from '@/lib/events/query'
import { formatMonthChip, resolveWindow } from '@/lib/paris-time'
import type { AgendaResponse } from '@/lib/api-v2/contract'
import type { EventQuery } from '@/lib/events/types'

type Params = Record<string, string | string[] | undefined> | URLSearchParams

export const AGENDA_PAGE = 30

const param = (p: Params, k: string) => (p instanceof URLSearchParams ? p.get(k) : (Array.isArray(p[k]) ? p[k]?.[0] : (p[k] as string | undefined)) ?? null)

/** `affiche=1`: the list of what is already running (exhibitions, plays in season). */
export function isAfficheMode(params: Params): boolean {
  return param(params, 'affiche') === '1'
}

/**
 * The listing query behind an Agenda URL.
 *   Day list: everything that STARTS in the period, runs included (68 % of plays
 *   are runs: a play opening on 3 March is listed on 3 March).
 *   « À l'affiche » (affiche=1, and the block above the list): what already runs.
 */
export function agendaQuery(params: Params, now: Date = new Date()): EventQuery {
  const q = parseEventParams(params, now, { readDates: true })
  if (isAfficheMode(params)) return { ...q, runsOnly: true, ongoingOnly: true, sort: q.near ? 'distance' : 'ending' }
  return { ...q, sort: q.near ? 'distance' : 'soon', excludeOngoing: true }
}

const safe = async <T>(p: Promise<T>, fallback: T, label: string): Promise<T> => {
  try {
    return await p
  } catch (err) {
    console.error(`[agenda] ${label} failed`, err)
    return fallback
  }
}

export async function getAgenda(params: Params, opts: { limit?: number; offset?: number } = {}): Promise<AgendaResponse> {
  const now = new Date()
  const query = agendaQuery(params, now)
  const affiche = isAfficheMode(params)
  const limit = Math.min(Math.max(opts.limit ?? AGENDA_PAGE, 1), 48)
  const byOffset = query.sort !== 'soon'
  const offset = byOffset ? Math.min(Math.max(opts.offset ?? 0, 0), 2000) : 0
  const firstPage = !query.cursor && offset === 0
  const window = resolveWindow(query.when, now)
  const text = query.q?.trim() || null

  const [page, ongoing, months, days, artists, venues] = await Promise.all([
    safeQueryEvents({ ...query, limit, offset }),
    firstPage && !affiche
      ? safeQueryEvents({ ...query, excludeOngoing: false, ongoingOnly: true, runsOnly: true, cursor: null, sort: 'ending', limit: 10 })
      : null,
    firstPage ? safe(getMonthCounts(query), [], 'months') : null,
    firstPage && window?.key === 'calendar-month' && query.when ? safe(getDayCounts(query, query.when), [], 'days') : null,
    firstPage && text && text.length >= 2 ? safe(suggestArtists(text), [], 'artists') : null,
    firstPage && text && text.length >= 3 ? safe(getSuggestions(text).then((s) => s.venues), [], 'venues') : null,
  ])

  // A failed query must not look like "nothing on" (nor be cached as such).
  if ('error' in page && page.error) throw new Error('agenda listing failed')

  const body: AgendaResponse = {
    understood: {
      when: query.when ?? null,
      whenLabel: window?.label ?? null,
      text,
      categories: query.categories ?? [],
      free: Boolean(query.free),
    },
    events: page.events,
    nextCursor: page.nextCursor ?? null,
    nextOffset: byOffset && page.hasMore ? offset + page.events.length : null,
  }
  if (firstPage) {
    body.total = page.total
    if (ongoing && !ongoing.error) {
      body.ongoing = ongoing.events
      body.ongoingTotal = ongoing.total
    }
    if (months) body.months = months.map((m) => ({ ...m, label: formatMonthChip(m.key, now) }))
    if (days) body.days = days
    if (artists) body.artists = artists.slice(0, 4)
    if (venues) body.venues = venues.slice(0, 3)
  }
  return body
}
