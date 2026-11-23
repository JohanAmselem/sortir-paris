/**
 * « Mes sorties » : les sorties gardées et « J’y vais » d'un membre, rangées
 * comme des billets (Aujourd’hui, Demain, Ce week-end, Cette semaine, puis par mois).
 * Pur : partagé par la page et les tests.
 */
import { getWindow, isLongRun, overlapsWindow, parisMonthKey } from './paris-time'
import { monthTitle } from './agenda-view'
import type { CardEvent } from './events/types'

export interface Outing {
  event: CardEvent
  saved: boolean
  going: boolean
}

export interface OutingGroup {
  key: string
  label: string
  items: Outing[]
}

/** Une seule entrée par sortie, gardée et/ou « J’y vais », triée par date. */
export function mergeOutings(saved: CardEvent[], going: CardEvent[]): Outing[] {
  const byId = new Map<string, Outing>()
  for (const e of saved) byId.set(e.id, { event: e, saved: true, going: false })
  for (const e of going) {
    const o = byId.get(e.id)
    if (o) o.going = true
    else byId.set(e.id, { event: e, saved: false, going: true })
  }
  return [...byId.values()].sort((a, b) => a.event.startDate.localeCompare(b.event.startDate))
}

/** Expos et saisons déjà commencées : à part, elles ne sont pas « ce soir ». */
const RUNNING = { key: 'running', label: 'À l’affiche' }

/** Passées : un groupe par mois, du plus récent au plus ancien. */
export function pastGroups(items: Outing[], now: Date = new Date()): OutingGroup[] {
  const groups = new Map<string, OutingGroup>()
  for (const item of [...items].sort((a, b) => b.event.startDate.localeCompare(a.event.startDate))) {
    const key = parisMonthKey(new Date(item.event.startDate))
    let g = groups.get(key)
    if (!g) {
      g = { key, label: monthTitle(key, now), items: [] }
      groups.set(key, g)
    }
    g.items.push(item)
  }
  return [...groups.values()]
}

/** À venir : les fenêtres proches d'abord (sans doublon), puis un groupe par mois. */
export function outingGroups(items: Outing[], now: Date = new Date()): OutingGroup[] {
  const windows = [
    { key: 'today', label: 'Aujourd’hui', w: getWindow('today', now) },
    { key: 'tomorrow', label: 'Demain', w: getWindow('tomorrow', now) },
    { key: 'weekend', label: 'Ce week-end', w: getWindow('weekend', now) },
    { key: 'week', label: 'Cette semaine', w: getWindow('week', now) },
  ]
  const groups = new Map<string, OutingGroup>()
  for (const item of items) {
    const running = isLongRun(item.event) && new Date(item.event.startDate) <= now
    const near = running ? RUNNING : windows.find(({ w }) => overlapsWindow(item.event, w, now))
    const key = near ? near.key : parisMonthKey(new Date(item.event.startDate))
    let g = groups.get(key)
    if (!g) {
      g = { key, label: near ? near.label : monthTitle(key, now), items: [] }
      groups.set(key, g)
    }
    g.items.push(item)
  }
  const order = (k: string) => {
    if (k === RUNNING.key) return '05'
    const i = windows.findIndex((w) => w.key === k)
    return i >= 0 ? `0${i}` : `1${k}`
  }
  return [...groups.values()].sort((a, b) => order(a.key).localeCompare(order(b.key)))
}
