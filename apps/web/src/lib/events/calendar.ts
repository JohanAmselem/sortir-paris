/**
 * Agenda counters: how many outings per month (next 18 months) and per day of a
 * month, for the same filters as the listing. One-off events only — long runs
 * (exhibitions, seasons) would count every day and are shown apart.
 * Cinema séances count once per film and per day/month, like the cards.
 */
import 'server-only'
import { unstable_cache } from 'next/cache'
import { events, venues, categories, withStatementTimeout } from '@sortir/db'
import { and, eq, sql } from 'drizzle-orm'
import { getMonthWindow, nextMonthKeys, parisDate } from '@/lib/paris-time'
import { STATEMENT_TIMEOUT_MS, bucketNow, buildConditions, filmKeySql, ts, withTimeout } from './query'
import type { EventQuery } from './types'

export interface MonthCount {
  key: string
  n: number
}
export interface DayCount {
  key: string
  n: number
}

export const AGENDA_MONTHS = 18

/** Paris "night day" of a start date: a 01:00 concert belongs to the evening before. */
const nightShift = sql`(${events.startDate} at time zone 'Europe/Paris' - interval '4 hours')`
const countExpr = sql<number>`(count(*) filter (where ${categories.slug} is distinct from 'cinema')
  + count(distinct ${filmKeySql}) filter (where ${categories.slug} = 'cinema'))::int`

/** Filters of the listing, without its window, cursor or paging. */
function filtersOnly(q: EventQuery): EventQuery {
  return { ...q, when: null, cursor: null, offset: 0, limit: undefined, sort: undefined, oneOffOnly: true, runsOnly: false }
}

async function loadMonthCounts(q: EventQuery): Promise<MonthCount[]> {
  const now = bucketNow()
  const keys = nextMonthKeys(AGENDA_MONTHS, now)
  const last = keys.at(-1)!.split('-').map(Number)
  const end = parisDate(last[0], last[1] + 1, 1, 4)
  const { where } = buildConditions(filtersOnly(q), now)
  const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
    tx
      .select({ key: sql<string>`to_char(${nightShift}, 'YYYY-MM')`, n: countExpr })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(where, sql`${events.startDate} >= ${ts(now)}`, sql`${events.startDate} < ${ts(end)}`))
      .groupBy(sql`1`)
  )
  const byKey = new Map(rows.map((r) => [String(r.key), Number(r.n)]))
  return keys.map((key) => ({ key, n: byKey.get(key) ?? 0 }))
}

async function loadDayCounts(q: EventQuery, month: string): Promise<DayCount[]> {
  const now = bucketNow()
  const w = getMonthWindow(month, now)
  if (!w) return []
  const { where } = buildConditions(filtersOnly(q), now)
  const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
    tx
      .select({ key: sql<string>`to_char(${nightShift}, 'YYYY-MM-DD')`, n: countExpr })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(where, sql`${events.startDate} >= ${ts(w.start)}`, sql`${events.startDate} < ${ts(w.end)}`))
      .groupBy(sql`1`)
      .orderBy(sql`1`)
  )
  return rows.map((r) => ({ key: String(r.key), n: Number(r.n) }))
}

const cachedMonths = unstable_cache(loadMonthCounts, ['agenda-months-v1'], { revalidate: 900, tags: ['events'] })
const cachedDays = unstable_cache(loadDayCounts, ['agenda-days-v1'], { revalidate: 900, tags: ['events'] })

export function getMonthCounts(q: EventQuery): Promise<MonthCount[]> {
  return withTimeout(cachedMonths(filtersOnly(q)), STATEMENT_TIMEOUT_MS + 1500, 'monthCounts')
}

export function getDayCounts(q: EventQuery, month: string): Promise<DayCount[]> {
  return withTimeout(cachedDays(filtersOnly(q), month), STATEMENT_TIMEOUT_MS + 1500, 'dayCounts')
}
