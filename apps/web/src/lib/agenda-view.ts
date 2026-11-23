/**
 * Logique pure de l'Agenda du site (et des pages qui réutilisent sa liste) :
 * liens qui gardent les filtres, bandes des mois et des jours, puces « On a
 * compris », regroupement par jour ou par créneau. Aucune dépendance serveur :
 * utilisée par les composants serveur ET par la liste client (« Voir plus »).
 */
import { CATEGORY_BY_SLUG } from './events/taxonomy'
import { formatLongDay, isLongRun, parisDate, parisNightDay, parisParts } from './paris-time'
import type { AgendaUnderstood, DayCountV2, MonthCountV2 } from './api-v2/contract'
import type { CardEvent } from './events/types'

type Params = Record<string, string | string[] | undefined> | URLSearchParams

/** Catégories des pages mois indexables (sitemap, pied de page). */
export const MAIN_CATEGORIES = ['concerts', 'theatre', 'spectacles', 'expos', 'soirees', 'festivals'] as const

const MONTH = /^\d{4}-\d{2}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Filtres explicites repris tels quels d'une URL à l'autre. */
const KEPT = ['arr', 'max', 'zone', 'mood', 'topic', 'xcat', 'lat', 'lng', 'radius', 'runs'] as const

function read(p: Params, key: string): string | undefined {
  if (p instanceof URLSearchParams) return p.get(key) ?? undefined
  const v = p[key]
  return Array.isArray(v) ? v[0] : v
}

export const isMonthKey = (v: string | null | undefined): boolean => Boolean(v && MONTH.test(v))
export const isDayKey = (v: string | null | undefined): boolean => Boolean(v && DAY.test(v))

/**
 * Ce que la personne regarde, reconstruit depuis ce qui a été compris : la date
 * lue dans le texte devient `when`, le texte restant devient `q`. Les liens des
 * mois, des jours et des puces partent de là (plus de date perdue en route).
 */
export function agendaState(sp: Params, understood: AgendaUnderstood): URLSearchParams {
  const s = new URLSearchParams()
  if (understood.when) s.set('when', understood.when)
  if (understood.categories.length) s.set('cat', understood.categories.join(','))
  if (understood.free) s.set('free', '1')
  for (const key of KEPT) {
    const v = read(sp, key)
    if (v) s.set(key, v)
  }
  if (understood.free) s.delete('max')
  if (understood.text) s.set('q', understood.text)
  return s
}

/** Copie avec une clé changée (null = retirée). */
export function withParam(params: URLSearchParams, key: string, value: string | null): URLSearchParams {
  const s = new URLSearchParams(params)
  if (value == null || value === '') s.delete(key)
  else s.set(key, value)
  return s
}

/**
 * Adresse de l'Agenda pour ces paramètres. Un mois seul (et au plus une
 * catégorie) donne la page indexable : `/agenda/2027-03`, `/agenda/2027-03/concerts`.
 */
export function agendaHref(params: URLSearchParams): string {
  const keys = [...new Set(params.keys())]
  const when = params.get('when')
  const cat = params.get('cat')
  const onlyMonth = isMonthKey(when) && keys.every((k) => k === 'when' || k === 'cat')
  if (onlyMonth && (!cat || (!cat.includes(',') && cat in CATEGORY_BY_SLUG))) {
    return cat ? `/agenda/${when}/${cat}` : `/agenda/${when}`
  }
  const qs = params.toString()
  return qs ? `/agenda?${qs}` : '/agenda'
}

/** Le mois d'une valeur `when` (mois ou jour), sinon null. */
export function monthOf(when: string | null | undefined): string | null {
  if (!when) return null
  if (isMonthKey(when)) return when
  if (isDayKey(when)) return when.slice(0, 7)
  return null
}

export interface MonthLink extends MonthCountV2 {
  href: string
  active: boolean
}

/** La bande des mois : les mois vides sont cachés, sauf celui qu'on regarde. */
export function monthLinks(months: MonthCountV2[], state: URLSearchParams): MonthLink[] {
  const active = monthOf(state.get('when'))
  return months
    .filter((m) => m.n > 0 || m.key === active)
    .map((m) => ({ ...m, href: agendaHref(withParam(state, 'when', m.key)), active: m.key === active }))
}

export interface DayLink {
  key: string
  /** « lun. » */
  weekday: string
  day: number
  n: number
  href: string
  active: boolean
}

const WEEKDAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

/** Les jours du mois (à partir d'aujourd'hui pour le mois en cours), avec leur compteur. */
export function dayLinks(month: string, days: DayCountV2[], state: URLSearchParams, now: Date = new Date()): DayLink[] {
  const [y, m] = month.split('-').map(Number)
  const counts = new Map(days.map((d) => [d.key, d.n]))
  const today = parisNightDay(now)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const first = today.year === y && today.month === m ? today.day : 1
  const activeDay = isDayKey(state.get('when')) ? state.get('when') : null
  const out: DayLink[] = []
  for (let d = first; d <= last; d++) {
    const key = `${month}-${String(d).padStart(2, '0')}`
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    out.push({
      key,
      weekday: WEEKDAYS_SHORT[weekday],
      day: d,
      n: counts.get(key) ?? 0,
      href: agendaHref(withParam(state, 'when', key)),
      active: key === activeDay,
    })
  }
  return out
}

export interface Chip {
  key: string
  label: string
  href: string
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * Le texte cherché tel que la personne l'a écrit (« Angèle »), pas sa forme
 * normalisée (« angele ») : on reprend les mots tapés qui ont été gardés.
 */
export function displayedText(raw: string | null | undefined, understoodText: string | null): string | null {
  if (!understoodText) return null
  const kept = new Set(fold(understoodText).split(/\s+/))
  const words = (raw ?? '').split(/\s+/).filter((w) => kept.has(fold(w).replace(/[^\p{L}\p{N}'’-]/gu, '')))
  return words.length ? words.join(' ') : understoodText
}

/** Puces retirables : la date, les catégories, le prix, le quartier, le texte. */
export function understoodChips(understood: AgendaUnderstood, state: URLSearchParams, raw?: string | null): Chip[] {
  const chips: Chip[] = []
  if (understood.when && understood.whenLabel) {
    chips.push({ key: 'when', label: understood.whenLabel, href: agendaHref(withParam(state, 'when', null)) })
  }
  for (const slug of understood.categories) {
    const rest = understood.categories.filter((c) => c !== slug)
    chips.push({
      key: `cat-${slug}`,
      label: (CATEGORY_BY_SLUG[slug]?.plural ?? slug).toLowerCase(),
      href: agendaHref(withParam(state, 'cat', rest.length ? rest.join(',') : null)),
    })
  }
  if (understood.free) chips.push({ key: 'free', label: 'gratuit', href: agendaHref(withParam(state, 'free', null)) })
  const max = state.get('max')
  if (max) chips.push({ key: 'max', label: `moins de ${max} €`, href: agendaHref(withParam(state, 'max', null)) })
  const zone = state.get('zone')
  if (zone === 'paris' || zone === 'banlieue') {
    chips.push({ key: 'zone', label: zone === 'paris' ? 'Paris' : 'banlieue', href: agendaHref(withParam(state, 'zone', null)) })
  }
  const arr = state.get('arr')
  if (arr) chips.push({ key: 'arr', label: arr.split(',').join(', '), href: agendaHref(withParam(state, 'arr', null)) })
  if (understood.text) chips.push({ key: 'q', label: `« ${displayedText(raw, understood.text)} »`, href: agendaHref(withParam(state, 'q', null)) })
  return chips
}

// ── Mots et nombres ─────────────────────────────────────────────────────────

const UNITS: Record<string, [string, string]> = {
  concerts: ['concert', 'concerts'],
  expos: ['expo', 'expos'],
  theatre: ['pièce', 'pièces'],
  spectacles: ['spectacle', 'spectacles'],
  danse: ['spectacle de danse', 'spectacles de danse'],
  cinema: ['film', 'films'],
  festivals: ['festival', 'festivals'],
  conferences: ['rencontre', 'rencontres'],
  ateliers: ['atelier', 'ateliers'],
  visites: ['visite', 'visites'],
  soirees: ['soirée', 'soirées'],
  sport: ['activité', 'activités'],
}

/** « 10 concerts », « 1 sortie », « 1 234 sorties ». */
export function countLabel(n: number, categories: string[] = []): string {
  const [one, many] = (categories.length === 1 && UNITS[categories[0]]) || ['sortie', 'sorties']
  return `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`
}

/** « 20 h », « 20 h 30 » (espaces insécables). */
export function formatHour(date: Date): string {
  const { hour, minute } = parisParts(date)
  return minute === 0 ? `${hour}\u00a0h` : `${hour}\u00a0h\u00a0${String(minute).padStart(2, '0')}`
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** « 1 mars » → « 1er mars » (typographie française). */
export function premier(s: string): string {
  return s.replace(/(^|\s)1 (?=\p{Ll})/gu, '$11er ')
}

// ── Regroupement de la liste ────────────────────────────────────────────────

export interface ListGroup {
  key: string
  label: string
  events: CardEvent[]
}

export const ONGOING_KEY = 'en-cours'

/** « 2027-03-04 » : le jour de Paris d'une date (une sortie à 1 h compte pour la veille). */
export function dayKeyOf(date: Date): string {
  const d = parisNightDay(date)
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}

/** « Jeudi 4 mars 2027 », « Aujourd’hui, lundi 23 novembre », « Demain, mardi 24 novembre ». */
export function dayLabel(key: string, now: Date = new Date()): string {
  const [y, m, d] = key.split('-').map(Number)
  const noon = parisDate(y, m, d, 12)
  const long = premier(formatLongDay(noon, now))
  const today = dayKeyOf(now)
  const t = parisNightDay(now)
  const tomorrow = dayKeyOf(parisDate(t.year, t.month, t.day + 1, 12))
  if (key === today) return `Aujourd’hui, ${long}`
  if (key === tomorrow) return `Demain, ${long}`
  return cap(long)
}

/**
 * Liste groupée par jour, dans l'ordre reçu (tri par date du serveur). Ce qui a
 * commencé avant la période (expos, saisons) va dans un groupe « En cours ».
 */
export function groupByDay(events: CardEvent[], now: Date = new Date(), from: Date | null = null): ListGroup[] {
  const start = from ?? now
  const groups = new Map<string, ListGroup>()
  for (const e of events) {
    const s = new Date(e.startDate)
    const key = s < start && (isLongRun(e) || s < now) ? ONGOING_KEY : dayKeyOf(s)
    let g = groups.get(key)
    if (!g) {
      g = { key, label: key === ONGOING_KEY ? 'En cours' : dayLabel(key, now), events: [] }
      groups.set(key, g)
    }
    g.events.push(e)
  }
  return [...groups.values()]
}

const SLOTS = ['En ce moment', 'Avant 17 h', '17 h – 20 h', '20 h – 22 h', 'Tard dans la nuit', 'Horaire à confirmer'] as const

/** Le créneau d'une sortie de ce soir. */
export function slotOf(e: CardEvent, now: Date = new Date()): (typeof SLOTS)[number] {
  const start = new Date(e.startDate)
  if (start <= now) return 'En ce moment'
  if (!e.timeKnown) return 'Horaire à confirmer'
  const h = parisParts(start).hour
  if (h < 17 && h >= 4) return 'Avant 17 h'
  if (h < 20) return '17 h – 20 h'
  if (h < 22) return '20 h – 22 h'
  return 'Tard dans la nuit'
}

/** « Ce soir » : groupé par créneau, toujours dans le même ordre, quelle que soit la page chargée. */
export function groupBySlot(events: CardEvent[], now: Date = new Date()): ListGroup[] {
  return SLOTS.map((slot) => ({ key: slot, label: slot, events: events.filter((e) => slotOf(e, now) === slot) })).filter((g) => g.events.length)
}

/** « Mars 2027 », « Décembre » : un mois en toutes lettres. */
export function monthTitle(ym: string, now: Date = new Date()): string {
  const [y, m] = ym.split('-').map(Number)
  const name = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)))
  return cap(y === parisParts(now).year ? name : `${name} ${y}`)
}
