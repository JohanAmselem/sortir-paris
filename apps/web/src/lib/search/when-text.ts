/**
 * Dates written in a search ("jazz samedi", "Angèle en mars", "concert 14 février",
 * "théâtre ce week-end", "expo 2027") → a window understood by resolveWindow()
 * (lib/paris-time.ts) + the rest of the text.
 *
 * Pure (no server import): shared with the mobile app (apps/mobile/src/shared).
 * Rules only, no AI: same answer every time, no cost, no outage.
 *
 * A bare month word is only read as a date when it cannot be a name: "Bruno Mars"
 * stays a search for Bruno Mars, "concert mars" and "en mars" become March.
 */
import { foldText } from '../events/fold'
import { formatDayLabel, formatMonthLong, parisNightDay } from '../paris-time'

export interface WhenFromText {
  /** Value for EventQuery.when ('tonight', '2027-03', '2027-02-14', 'A..B'), null when none. */
  when: string | null
  /** Human label of what was understood ("samedi 28 nov.", "mars 2027"), null when none. */
  label: string | null
  /** The query without the date words (null when nothing is left). */
  rest: string | null
}

const MONTHS: Array<[RegExp, number]> = [
  [/^janv(?:ier)?\.?$/, 1],
  [/^fev(?:r(?:ier)?)?\.?$/, 2],
  [/^mars$/, 3],
  [/^avr(?:il)?\.?$/, 4],
  [/^mai$/, 5],
  [/^juin$/, 6],
  [/^juil(?:let)?\.?$/, 7],
  [/^aout$/, 8],
  [/^sept(?:embre)?\.?$/, 9],
  [/^oct(?:obre)?\.?$/, 10],
  [/^nov(?:embre)?\.?$/, 11],
  [/^dec(?:embre)?\.?$/, 12],
]
const WEEKDAYS: Record<string, number> = { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6 }

/** Words after which a bare month is a date, not a name ("concert mars", "jazz mai"). */
const CONTEXT_WORDS = new Set(
  (
    'en de du au mois debut fin mi le la les concert concerts expo expos exposition expositions theatre spectacle spectacles ' +
    'danse cinema film films festival festivals soiree soirees atelier ateliers visite visites conference conferences ' +
    'sortie sorties sortir quoi faire jazz rock rap electro techno metal pop classique opera humour stand-up standup ' +
    'gratuit gratuits gratuite famille enfants'
  ).split(' ')
)

const FILLERS = /^(?:(?:a|au|aux|de|des|du|en|et|la|le|les|l|d|un|une|pour|avec|ce|cet|cette|ces|paris|mois)\s*)*$/

function monthNumber(token: string): number | null {
  for (const [re, n] of MONTHS) if (re.test(token)) return n
  return null
}

const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

function validDay(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** Year of a day/month written without a year: this year, or next year once it is past. */
function yearFor(month: number, day: number | null, today: { year: number; month: number; day: number }): number {
  if (month > today.month) return today.year
  if (month < today.month) return today.year + 1
  if (day == null || day >= today.day) return today.year
  return today.year + 1
}

function dayLabel(iso: string, now: Date): string {
  const [y, m, d] = iso.split('-').map(Number)
  // Noon UTC is the same Paris day all year long.
  return formatDayLabel(new Date(Date.UTC(y, m - 1, d, 12)), now)
}

export function whenFromText(raw: string, now: Date = new Date()): WhenFromText {
  const none: WhenFromText = { when: null, label: null, rest: raw.trim() || null }
  if (!raw.trim()) return { when: null, label: null, rest: null }
  const today = parisNightDay(now)
  // Folded, apostrophes and slashes spaced out, keep digits/letters/hyphens.
  const text = ` ${foldText(raw).replace(/[’']/g, ' ').replace(/[^a-z0-9/\s-]/g, ' ').replace(/\s+/g, ' ').trim()} `

  let when: string | null = null
  let label: string | null = null
  let rest = text

  const take = (re: RegExp, value: string, lab: string) => {
    if (when) return false
    const m = re.exec(rest)
    if (!m) return false
    when = value
    label = lab
    rest = rest.replace(re, ' ')
    return true
  }

  // 1. Fixed expressions.
  take(/\s(?:ce soir|cette nuit|ce soir-ci)\s/, 'tonight', 'ce soir')
  take(/\s(?:maintenant|tout de suite|en ce moment)\s/, 'now', 'maintenant')
  take(/\s(?:aujourd hui|aujourdhui)\s/, 'today', "aujourd'hui")
  {
    // Day overflow (31 + 2) normalised through a Date.
    const dt = new Date(Date.UTC(today.year, today.month - 1, today.day + 2))
    const iso = isoDay(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
    take(/\s(?:apres-demain|apres demain)\s/, iso, dayLabel(iso, now))
  }
  take(/\sdemain\s/, 'tomorrow', 'demain')
  take(/\s(?:ce |le )?week-?end\s/, 'weekend', 'ce week-end')
  take(/\s(?:cette semaine|dans la semaine)\s/, 'week', 'cette semaine')
  take(/\s(?:ce mois-ci|ce mois ci|ce mois)\s/, 'month', 'ce mois-ci')
  if (!when) {
    const m = /\s(?:le )?mois prochain\s/.exec(rest)
    if (m) {
      const y = today.month === 12 ? today.year + 1 : today.year
      const mo = today.month === 12 ? 1 : today.month + 1
      when = `${y}-${pad(mo)}`
      label = formatMonthLong(when, now)
      rest = rest.replace(m[0], ' ')
    }
  }
  if (!when) {
    const m = /\s(?:a |pour |le )?(nouvel an|reveillon(?: du nouvel an)?|saint-sylvestre|saint sylvestre)\s/.exec(rest)
    if (m) {
      const y = today.month === 1 && today.day <= 1 ? today.year - 1 : today.year
      when = isoDay(y, 12, 31)
      label = 'le 31 décembre'
      rest = rest.replace(m[0], ' ')
    }
  }
  if (!when) {
    const m = /\s(?:a |pour )?noel\s/.exec(rest)
    if (m) {
      const y = today.month === 12 && today.day > 25 ? today.year + 1 : today.year
      when = `${isoDay(y, 12, 24)}..${isoDay(y, 12, 25)}`
      label = 'à Noël'
      rest = rest.replace(m[0], ' ')
    }
  }

  // 2. "14/02", "14/02/2027".
  if (!when) {
    const m = /\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/.exec(rest)
    if (m) {
      const d = Number(m[1])
      const mo = Number(m[2])
      let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : yearFor(mo, d, today)
      if (mo >= 1 && mo <= 12 && validDay(y, mo, d)) {
        if (!m[3] && y < today.year) y = today.year
        when = isoDay(y, mo, d)
        label = dayLabel(when, now)
        rest = rest.replace(m[0], ' ')
      }
    }
  }

  // 3. "14 février", "le 14 fevrier 2027", "1er mars".
  if (!when) {
    const re = /\s(?:le |du )?(\d{1,2})(?:er)?\s+([a-z]+\.?)(?:\s+(20\d{2}))?\s/g
    let m: RegExpExecArray | null
    while ((m = re.exec(rest))) {
      const mo = monthNumber(m[2])
      if (!mo) continue
      const d = Number(m[1])
      const y = m[3] ? Number(m[3]) : yearFor(mo, d, today)
      if (!validDay(y, mo, d)) continue
      when = isoDay(y, mo, d)
      label = dayLabel(when, now)
      rest = rest.replace(m[0], ' ')
      break
    }
  }

  // 4. Weekdays: "samedi", "ce samedi", "samedi prochain" → the next one (today counts).
  if (!when) {
    const m = /\s(?:ce |le )?(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?: soir| prochain)?\s/.exec(rest)
    if (m) {
      const target = WEEKDAYS[m[1]]
      const offset = (target - today.weekday + 7) % 7
      const dt = new Date(Date.UTC(today.year, today.month - 1, today.day + offset))
      when = isoDay(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
      label = dayLabel(when, now)
      rest = rest.replace(m[0], ' ')
    }
  }

  // 5. Months: "mars 2027", "en mars", "concert mars" (not "Bruno Mars").
  if (!when) {
    const tokens = rest.trim().split(' ').filter(Boolean)
    for (let i = 0; i < tokens.length; i++) {
      const mo = monthNumber(tokens[i])
      if (!mo) continue
      const next = tokens[i + 1]
      const prev = tokens[i - 1]
      const hasYear = next != null && /^20\d{2}$/.test(next)
      const alone = tokens.length === 1
      const inContext = prev != null && CONTEXT_WORDS.has(prev)
      if (!hasYear && !alone && !inContext) continue
      const y = hasYear ? Number(next) : yearFor(mo, null, today)
      const key = `${y}-${pad(mo)}`
      // A month already over (explicit past year) is not a window.
      if ((y - today.year) * 12 + (mo - today.month) < 0) break
      when = key
      label = formatMonthLong(key, now)
      tokens.splice(i, hasYear ? 2 : 1)
      if (tokens[i - 1] === 'en' || tokens[i - 1] === 'de' || tokens[i - 1] === 'mois') tokens.splice(i - 1, 1)
      rest = ` ${tokens.join(' ')} `
      break
    }
  }

  // 6. A year alone: "en 2027", "concerts 2027".
  if (!when) {
    const m = /\s(?:en )?(20\d{2})\s/.exec(rest)
    if (m) {
      const y = Number(m[1])
      if (y === today.year) {
        when = `${isoDay(today.year, today.month, today.day)}..${isoDay(y, 12, 31)}`
        label = `d'ici la fin de l'année`
        rest = rest.replace(m[0], ' ')
      } else if (y === today.year + 1) {
        when = `${isoDay(y, 1, 1)}..${isoDay(y, 12, 31)}`
        label = `en ${y}`
        rest = rest.replace(m[0], ' ')
      }
    }
  }

  if (!when) return none
  const left = rest.replace(/\s+/g, ' ').trim()
  return { when, label, rest: !left || FILLERS.test(left) ? null : left }
}
