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

/** The listing query behind an Agenda URL. */
export function agendaQuery(params: Params, now: Date = new Date()): EventQuery {
  const q = parseEventParams(params, now)
  const runsAsked = q.categories?.includes('expos') ?? false
  return {
    ...q,
    sort: q.near ? 'distance' : 'soon',
    // Exhibitions and seasons would sit on every day: shown apart, unless asked for.
    oneOffOnly: !runsAsked,
  }
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
  const limit = Math.min(Math.max(opts.limit ?? AGENDA_PAGE, 1), 48)
  const byDistance = query.sort === 'distance'
  const offset = byDistance ? Math.min(Math.max(opts.offset ?? 0, 0), 2000) : 0
  const firstPage = !query.cursor && offset === 0
  const window = resolveWindow(query.when, now)
  const text = query.q?.trim() || null

  const [page, ongoing, months, days, artists, venues] = await Promise.all([
    safeQueryEvents({ ...query, limit, offset }),
    firstPage && query.oneOffOnly
      ? safeQueryEvents({ ...query, oneOffOnly: false, runsOnly: true, when: query.when ?? 'week', cursor: null, sort: 'popular', limit: 10 })
      : null,
    firstPage ? safe(getMonthCounts(query), [], 'months') : null,
    firstPage && window?.key === 'calendar-month' && query.when ? safe(getDayCounts(query, query.when), [], 'days') : null,
    firstPage && text && text.length >= 2 ? safe(suggestArtists(text), [], 'artists') : null,
    firstPage && text && text.length >= 3 ? safe(getSuggestions(text).then((s) => s.venues), [], 'venues') : null,
  ])

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
    nextOffset: byDistance && page.hasMore ? offset + page.events.length : null,
  }
  if (firstPage) {
    body.total = page.total
    if (ongoing) body.ongoing = ongoing.events
    if (months) body.months = months.map((m) => ({ ...m, label: formatMonthChip(m.key, now) }))
    if (days) body.days = days
    if (artists) body.artists = artists.slice(0, 4)
    if (venues) body.venues = venues.slice(0, 3)
  }
  return body
}
