/**
 * Paris time — the single source of truth for every date window and every
 * displayed date on the site. Vercel functions run in UTC, so nothing here may
 * rely on the runtime timezone (no setHours / getDay / toLocale* without
 * timeZone).
 */
import { fromZonedTime } from 'date-fns-tz'

export const PARIS_TZ = 'Europe/Paris'

/** A Paris "day" ends at 04:00 the next morning: a 01:00 concert is still tonight. */
const NIGHT_END_HOUR = 4
/** "Ce soir" starts at 17:00. */
const EVENING_START_HOUR = 17
/** Assumed duration of an event without end date. */
export const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000
/** Beyond this duration an event is a "run" (exhibition, play season), not a one-off. */
export const LONG_RUN_MS = 12 * 60 * 60 * 1000

export interface ParisParts {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  /** 0 = Sunday … 6 = Saturday */
  weekday: number
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: PARIS_TZ,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  weekday: 'short',
  hourCycle: 'h23',
})

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function parisParts(date: Date): ParisParts {
  const parts: Record<string, string> = {}
  for (const p of partsFormatter.formatToParts(date)) parts[p.type] = p.value
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday],
  }
}

/** UTC instant of a Paris wall-clock time. Day overflow (day 32, day 0) is normalised. */
export function parisDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const norm = new Date(Date.UTC(year, month - 1, day))
  const pad = (n: number) => String(n).padStart(2, '0')
  const local = `${norm.getUTCFullYear()}-${pad(norm.getUTCMonth() + 1)}-${pad(norm.getUTCDate())}T${pad(hour)}:${pad(minute)}:00`
  return fromZonedTime(local, PARIS_TZ)
}

/**
 * The Paris calendar day an instant belongs to, using the 04:00 night boundary
 * (Saturday 01:30 still belongs to Friday night).
 */
export function parisNightDay(date: Date): { year: number; month: number; day: number; weekday: number } {
  const p = parisParts(date)
  if (p.hour < NIGHT_END_HOUR) {
    const prev = parisParts(new Date(date.getTime() - (NIGHT_END_HOUR + 1) * 3600_000))
    return { year: prev.year, month: prev.month, day: prev.day, weekday: prev.weekday }
  }
  return { year: p.year, month: p.month, day: p.day, weekday: p.weekday }
}

export type WindowKey = 'now' | 'next3h' | 'tonight' | 'today' | 'tomorrow' | 'weekend' | 'week' | 'month'

export interface TimeWindow {
  key: WindowKey | 'date'
  start: Date
  end: Date
  /** Include long runs (exhibitions…) that are ongoing during the window. */
  includeOngoing: boolean
  label: string
}

/** Paris day (with night boundary) + N days, at hour:minute. */
function dayAt(base: { year: number; month: number; day: number }, addDays: number, hour: number, minute = 0) {
  return parisDate(base.year, base.month, base.day + addDays, hour, minute)
}

export function getWindow(key: WindowKey, now: Date = new Date()): TimeWindow {
  const today = parisNightDay(now)
  const max = (a: Date, b: Date) => (a > b ? a : b)

  switch (key) {
    case 'now':
      // Happening now or starting within 2 hours.
      return {
        key,
        start: now,
        end: new Date(now.getTime() + 2 * 3600_000),
        includeOngoing: true,
        label: 'En ce moment',
      }
    case 'next3h':
      // "Autour de moi, maintenant": starting within 3 hours, or a one-off
      // already under way. No exhibitions (shown in their own block).
      return {
        key,
        start: now,
        end: new Date(now.getTime() + 3 * 3600_000),
        includeOngoing: false,
        label: 'Dans les 3 heures',
      }
    case 'tonight':
      return {
        key,
        start: max(now, dayAt(today, 0, EVENING_START_HOUR)),
        end: dayAt(today, 1, NIGHT_END_HOUR),
        includeOngoing: false,
        label: 'Ce soir',
      }
    case 'today':
      return {
        key,
        start: now,
        end: dayAt(today, 1, NIGHT_END_HOUR),
        includeOngoing: true,
        label: "Aujourd'hui",
      }
    case 'tomorrow':
      return {
        key,
        start: dayAt(today, 1, 6),
        end: dayAt(today, 2, NIGHT_END_HOUR),
        includeOngoing: true,
        label: 'Demain',
      }
    case 'weekend': {
      // Friday 18:00 → Monday 04:00. On Mon–Thu: the coming weekend.
      // Fri/Sat/Sun (night day): the current one, from now.
      const wd = today.weekday
      const offsetToFriday = wd === 0 ? -2 : wd === 6 ? -1 : 5 - wd
      const start = dayAt(today, offsetToFriday, 18)
      const end = dayAt(today, offsetToFriday + 3, NIGHT_END_HOUR)
      return { key, start: max(now, start), end, includeOngoing: true, label: 'Ce week-end' }
    }
    case 'week':
      return {
        key,
        start: now,
        end: dayAt(today, 7, NIGHT_END_HOUR),
        includeOngoing: true,
        label: 'Cette semaine',
      }
    case 'month':
      return {
        key,
        start: now,
        end: dayAt(today, 30, NIGHT_END_HOUR),
        includeOngoing: true,
        label: 'Ce mois-ci',
      }
  }
}

/** Window for an explicit YYYY-MM-DD Paris date. Returns null when invalid. */
export function getDateWindow(iso: string, now: Date = new Date()): TimeWindow | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const start = parisDate(y, mo, d, 6)
  const end = parisDate(y, mo, d + 1, NIGHT_END_HOUR)
  if (end < now) return null
  return {
    key: 'date',
    start: start < now ? now : start,
    end,
    includeOngoing: true,
    label: formatDayLabel(start),
  }
}

export const WINDOW_KEYS: WindowKey[] = ['now', 'next3h', 'tonight', 'today', 'tomorrow', 'weekend', 'week', 'month']

/** Accepts the legacy URL values too (`date=today|weekend|week`). */
export function resolveWindow(value: string | null | undefined, now: Date = new Date()): TimeWindow | null {
  if (!value) return null
  const v = value.trim().toLowerCase()
  const alias: Record<string, WindowKey> = {
    'ce-soir': 'tonight',
    soir: 'tonight',
    aujourdhui: 'today',
    demain: 'tomorrow',
    'week-end': 'weekend',
    semaine: 'week',
    mois: 'month',
    maintenant: 'now',
    '3h': 'next3h',
  }
  const key = (WINDOW_KEYS as string[]).includes(v) ? (v as WindowKey) : alias[v]
  if (key) return getWindow(key, now)
  return getDateWindow(v, now)
}

// ── Event timing helpers ───────────────────────────────────────────────────

export interface EventTiming {
  startDate: Date | string
  endDate?: Date | string | null
  timeKnown?: boolean | null
}

const toDate = (d: Date | string) => (d instanceof Date ? d : new Date(d))

export function effectiveEnd(e: EventTiming): Date {
  const start = toDate(e.startDate)
  if (e.endDate) return toDate(e.endDate)
  return new Date(start.getTime() + DEFAULT_DURATION_MS)
}

export function isLongRun(e: EventTiming): boolean {
  if (!e.endDate) return false
  return toDate(e.endDate).getTime() - toDate(e.startDate).getTime() > LONG_RUN_MS
}

export function isOngoing(e: EventTiming, now: Date = new Date()): boolean {
  return toDate(e.startDate) <= now && effectiveEnd(e) >= now
}

/** Does the event happen during the window? (same rule as the SQL in lib/events/query.ts) */
export function overlapsWindow(e: EventTiming, w: TimeWindow, now: Date = new Date()): boolean {
  const start = toDate(e.startDate)
  const end = effectiveEnd(e)
  if (start > w.end || end < w.start) return false
  if (start >= w.start) return true
  // Started before the window: long runs when the window accepts them,
  // one-off events only when the window starts now (happening right now).
  if (isLongRun(e)) return w.includeOngoing
  return w.start.getTime() <= now.getTime() + 5 * 60_000
}

// ── Formatting (always Europe/Paris) ───────────────────────────────────────

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS_TZ, ...opts })
const fmtWeekdayDay = fmt({ weekday: 'short', day: 'numeric', month: 'short' })
const fmtDayMonth = fmt({ day: 'numeric', month: 'short' })
const fmtLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' })
const fmtLongYear = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** "20h", "20h30" */
export function formatTime(date: Date): string {
  const { hour, minute } = parisParts(date)
  return minute === 0 ? `${hour}h` : `${hour}h${String(minute).padStart(2, '0')}`
}

function sameNightDay(a: Date, b: Date) {
  const x = parisNightDay(a)
  const y = parisNightDay(b)
  return x.year === y.year && x.month === y.month && x.day === y.day
}

function dayDiff(from: Date, to: Date): number {
  const a = parisNightDay(from)
  const b = parisNightDay(to)
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400_000)
}

/** "lun. 12 oct." */
export function formatDayLabel(date: Date): string {
  return fmtWeekdayDay.format(date).replace(/\.$/, '.')
}

/** "lundi 12 octobre" (+ year when not the current year) */
export function formatLongDay(date: Date, now: Date = new Date()): string {
  return parisParts(date).year === parisParts(now).year ? fmtLong.format(date) : fmtLongYear.format(date)
}

/** "12 nov." */
export function formatShortDay(date: Date): string {
  return fmtDayMonth.format(date)
}

/**
 * Human "when" for cards: what matters to decide.
 *   "Ce soir · 20h30", "Demain · 19h", "Sam. 12 oct. · 21h",
 *   "En cours · jusqu'au 12 nov.", "Jusqu'au dim. 15 nov.", "Dès le 3 déc."
 */
export function formatWhen(e: EventTiming, now: Date = new Date()): string {
  const start = toDate(e.startDate)
  const end = e.endDate ? toDate(e.endDate) : null
  const timeKnown = e.timeKnown !== false
  const long = isLongRun(e)

  if (long && end) {
    if (start <= now) {
      const left = dayDiff(now, end)
      if (left <= 0) return "Dernier jour aujourd'hui"
      if (left === 1) return 'Dernier jour demain'
      if (left <= 7) return `Plus que ${left} jours · jusqu'au ${formatShortDay(end)}`
      return `En cours · jusqu'au ${formatShortDay(end)}`
    }
    return `Du ${formatShortDay(start)} au ${formatShortDay(end)}`
  }

  const time = timeKnown ? ` · ${formatTime(start)}` : ''
  if (start <= now && effectiveEnd(e) >= now) {
    if (!timeKnown) return "Aujourd'hui"
    // Opening hours (an exhibition open 9h–19h today), not a show that started.
    if (end && end.getTime() - start.getTime() >= 4 * 3600_000) return `Aujourd'hui · jusqu'à ${formatTime(end)}`
    return `En ce moment · depuis ${formatTime(start)}`
  }

  const diff = dayDiff(now, start)
  if (diff === 0) {
    const h = parisParts(start).hour
    const evening = h >= EVENING_START_HOUR || h < NIGHT_END_HOUR
    return `${evening ? 'Ce soir' : "Aujourd'hui"}${time}`
  }
  if (diff === 1) return `Demain${time}`
  if (diff > 1 && diff < 7) {
    const wd = fmt({ weekday: 'long' }).format(start)
    return `${wd.charAt(0).toUpperCase()}${wd.slice(1)}${time}`
  }
  const label = formatDayLabel(start)
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}${time}`
}

/**
 * Next séances of a film: "Ce soir · 18h, 20h30, 22h15" (times of the first day
 * only, so the line stays short).
 */
export function formatFilmTimes(times: string[], now: Date = new Date()): string {
  const dates = times.map((t) => new Date(t)).filter((d) => d >= new Date(now.getTime() - 15 * 60_000))
  if (!dates.length) return ''
  const first = dates[0]
  const sameDay = dates.filter((d) => sameNightDay(d, first)).slice(0, 3)
  const label = formatWhen({ startDate: first }, now)
  if (sameDay.length < 2) return label
  return `${label}, ${sameDay.slice(1).map(formatTime).join(', ')}`
}

/** Short relative badge for the image overlay, or null. */
export function urgencyBadge(e: EventTiming, now: Date = new Date()): string | null {
  const start = toDate(e.startDate)
  if (isLongRun(e) && e.endDate) {
    const left = dayDiff(now, toDate(e.endDate))
    if (start <= now && left <= 3) return left <= 0 ? 'Dernier jour' : `J-${left}`
    return null
  }
  const ms = start.getTime() - now.getTime()
  if (e.timeKnown !== false && ms > 0 && ms < 3 * 3600_000) {
    const min = Math.round(ms / 60_000)
    return min < 60 ? `Dans ${min} min` : `Dans ${Math.round(min / 60)} h`
  }
  if (isOngoing(e, now) && e.timeKnown !== false) return 'En cours'
  return null
}

/** Full date line for the event page. */
export function formatFullWhen(e: EventTiming, now: Date = new Date()): { primary: string; secondary: string | null } {
  const start = toDate(e.startDate)
  const end = e.endDate ? toDate(e.endDate) : null
  const timeKnown = e.timeKnown !== false
  if (isLongRun(e) && end) {
    return {
      primary: `Du ${formatLongDay(start, now)} au ${formatLongDay(end, now)}`,
      secondary: start <= now ? `En cours — ${formatWhen(e, now).replace(/^En cours · /, '')}` : null,
    }
  }
  const day = formatLongDay(start, now)
  const primary = `${day.charAt(0).toUpperCase()}${day.slice(1)}`
  if (!timeKnown) return { primary, secondary: 'Horaire non communiqué' }
  const until = end && sameNightDay(start, end) ? ` – ${formatTime(end)}` : ''
  return { primary, secondary: `${formatTime(start)}${until}` }
}

/** "2026-10-07" in Paris time (night boundary ignored). */
export function parisISODate(date: Date): string {
  const p = parisParts(date)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Monday 00:00 Paris of the current week, as YYYY-MM-DD (weekly drops, swipe quotas). */
export function parisWeekStart(now: Date = new Date()): string {
  const p = parisParts(now)
  const offset = (p.weekday + 6) % 7
  return parisISODate(parisDate(p.year, p.month, p.day - offset, 12))
}

/** Start of the current Paris calendar day (daily quotas). */
export function parisDayStart(now: Date = new Date()): Date {
  const p = parisParts(now)
  return parisDate(p.year, p.month, p.day, 0)
}
