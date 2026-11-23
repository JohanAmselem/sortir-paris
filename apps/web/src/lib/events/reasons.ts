/**
 * One short, factual reason per pick ("Gratuit", "Moins de 15 €", "Dernier jour"…).
 * Facts only, read from the event: never a claim we cannot check ("il reste des places").
 * Pure: shared with the mobile app.
 */
import { isLongRun } from '../paris-time'
import type { CardEvent } from './types'

const HOUR = 3600_000
const DAY = 24 * HOUR

export function pickReason(e: CardEvent, now: Date = new Date()): string | null {
  if (e.distanceKm != null && e.distanceKm <= 1.5) return 'Près de toi'
  const start = new Date(e.startDate).getTime()
  const ms = start - now.getTime()
  if (e.timeKnown && ms > 0 && ms <= 2 * HOUR) {
    const min = Math.round(ms / 60_000)
    return min < 60 ? `Dans ${min} min` : `Dans ${Math.round(min / 60)} h`
  }
  if (isLongRun(e) && e.endDate) {
    const left = new Date(e.endDate).getTime() - now.getTime()
    if (left >= 0 && left <= DAY) return 'Dernier jour'
    if (left > 0 && left <= 4 * DAY) return 'Derniers jours'
  }
  if (e.priceStatus === 'free') return 'Gratuit'
  const max = Math.max(e.priceMin, e.priceMax)
  if (e.priceStatus === 'paid' && max >= 300) {
    if (max < 1500) return 'Moins de 15 €'
    if (max < 2500) return 'Moins de 25 €'
  }
  if (e.isNew) return 'Nouveau'
  if (e.venue?.signature) return 'Lieu phare'
  return null
}

export function withReasons(list: CardEvent[], now: Date = new Date()): CardEvent[] {
  return list.map((e) => ({ ...e, reason: pickReason(e, now) }))
}
