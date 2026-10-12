/**
 * Publication schedule (Europe/Paris), pure.
 *   every day 18:00   carousel « Demain à Paris » + stories by theme (same window)
 *   Monday 08:00      carousel « Ta semaine à Paris » (Monday → Sunday)
 *   Thursday 12:00    carousel « Ton week-end à Paris » (Friday evening → Sunday)
 */
import { PARIS_TZ, formatLongDay, getWindow, parisDate, parisISODate, parisParts, type TimeWindow } from '@/lib/paris-time'
import { STORY_THEME_KEYS, type ThemeKey } from './themes'
import type { PostKind, WindowKind } from './types'

export interface PlannedPost {
  kind: PostKind
  theme: ThemeKey
  /** Paris day of publication, YYYY-MM-DD. */
  forDate: string
  scheduledAt: Date
  window: WindowKind
}

const WINDOW_KEY = { demain: 'tomorrow', semaine: 'week', weekend: 'weekend' } as const

export function parseISODate(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  // Reject 2026-02-31 and the like.
  if (parisISODate(parisDate(year, month, day, 12)) !== iso) return null
  return { year, month, day }
}

/** Paris date + n days, YYYY-MM-DD. */
export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso)
  if (!d) throw new Error(`Invalid date ${iso}`)
  return parisISODate(parisDate(d.year, d.month, d.day + n, 12))
}

/** Every post planned on a Paris day. */
export function planForDate(forDate: string): PlannedPost[] {
  const d = parseISODate(forDate)
  if (!d) return []
  const at = (h: number) => parisDate(d.year, d.month, d.day, h, 0)
  const weekday = parisParts(at(12)).weekday
  const plan: PlannedPost[] = []
  if (weekday === 1) plan.push({ kind: 'carousel', theme: 'semaine', forDate, scheduledAt: at(8), window: 'semaine' })
  if (weekday === 4) plan.push({ kind: 'carousel', theme: 'weekend', forDate, scheduledAt: at(12), window: 'weekend' })
  plan.push({ kind: 'carousel', theme: 'demain', forDate, scheduledAt: at(18), window: 'demain' })
  for (const theme of STORY_THEME_KEYS) {
    plan.push({ kind: 'story', theme, forDate, scheduledAt: at(18), window: 'demain' })
  }
  return plan
}

/** Event window covered by a post published at `scheduledAt`. */
export function eventWindow(window: WindowKind, scheduledAt: Date): TimeWindow {
  return getWindow(WINDOW_KEY[window], scheduledAt)
}

const dayMonth = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS_TZ, day: 'numeric', month: 'long' })
const dayNum = (d: Date) => {
  const n = parisParts(d).day
  return n === 1 ? '1er' : String(n)
}
const dayMonthLabel = (d: Date) => dayMonth.format(d).replace(/^1 /, '1er ')

/** « mercredi 15 octobre », « du 13 au 19 octobre », « du 31 octobre au 2 novembre ». */
export function windowDateLabel(window: WindowKind, w: TimeWindow): string {
  if (window === 'demain') return formatLongDay(w.start, w.start)
  // The window ends at 04:00 the day after its last day.
  const last = new Date(w.end.getTime() - 6 * 3600_000)
  const a = parisParts(w.start)
  const b = parisParts(last)
  if (a.year === b.year && a.month === b.month) return `du ${dayNum(w.start)} au ${dayMonthLabel(last)}`
  return `du ${dayMonthLabel(w.start)} au ${dayMonthLabel(last)}`
}
