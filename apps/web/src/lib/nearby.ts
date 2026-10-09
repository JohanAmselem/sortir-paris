/**
 * "Autour de moi, maintenant" (/autour-de-moi). Pure helpers shared by the page
 * and its tests. The position stays in the browser: it is only sent, rounded,
 * as query parameters of /api/events, and never stored.
 */
import { parisParts } from './paris-time'
import type { CardEvent } from './events/types'

export const RADII = [1, 2, 5] as const
export type Radius = (typeof RADII)[number]

/** ~200 m grid: enough for "à 600 m", and nearby users share cache entries. */
const GRID = 0.002

export function roundCoord(x: number): number {
  return Math.round(Math.round(x / GRID) * GRID * 1000) / 1000
}

/** Same bounds as parseEventParams (lib/events/params.ts): outside, `near` is ignored. */
export function inParisArea(lat: number, lng: number): boolean {
  return lat > 48.5 && lat < 49.2 && lng > 1.9 && lng < 2.9
}

export type NearbyWhere = { lat: number; lng: number; radius: Radius } | { arr: string }

/** Query strings for /api/events: events of the next 3 hours, and exhibitions open now. */
export function nearbyParams(where: NearbyWhere, noCinema: boolean): { events: string; expos: string } {
  const base = new URLSearchParams()
  if ('arr' in where) {
    base.set('arr', where.arr)
    base.set('sort', 'soon')
  } else {
    base.set('lat', roundCoord(where.lat).toFixed(3))
    base.set('lng', roundCoord(where.lng).toFixed(3))
    base.set('radius', String(where.radius))
    base.set('sort', 'distance')
  }
  const events = new URLSearchParams(base)
  events.set('when', 'next3h')
  // Exhibitions have their own block below.
  events.set('xcat', noCinema ? 'cinema,expos' : 'expos')
  events.set('limit', '30')
  const expos = new URLSearchParams(base)
  expos.set('when', 'now')
  expos.set('cat', 'expos')
  expos.set('limit', '8')
  return { events: events.toString(), expos: expos.toString() }
}

/**
 * Opening hours of exhibitions are unknown for most runs: the "open now" block
 * is only shown during usual museum hours (10h–19h Paris).
 */
export function museumHours(now: Date): boolean {
  const h = parisParts(now).hour
  return h >= 10 && h < 19
}

/** One numbered pin per venue, in list order (the number is shown on the card too). */
export function venuePins(events: CardEvent[]): Array<{ key: string; name: string; lat: number; lng: number; label: number }> {
  const pins = new Map<string, { key: string; name: string; lat: number; lng: number; label: number }>()
  for (const e of events) {
    const v = e.venue
    if (!v || v.lat == null || v.lng == null || pins.has(v.slug)) continue
    pins.set(v.slug, { key: v.slug, name: v.name, lat: v.lat, lng: v.lng, label: pins.size + 1 })
  }
  return [...pins.values()]
}
