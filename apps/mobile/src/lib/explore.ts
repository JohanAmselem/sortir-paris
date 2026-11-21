/**
 * Explorer et carte : état des filtres et traduction en paramètres d'URL, au
 * même format que le site (apps/web/src/lib/events/params.ts : when, cat, arr,
 * free, max, mood, q), pour que /api/events et /api/map les comprennent tels quels.
 */
import { useEffect, useState } from 'react'
import { buildEventParams } from '@/shared'

export type WhenKey = 'now' | 'tonight' | 'tomorrow' | 'weekend' | 'week'

export const WHEN_OPTIONS: Array<{ key: WhenKey; label: string }> = [
  { key: 'now', label: 'Maintenant' },
  { key: 'tonight', label: 'Ce soir' },
  { key: 'tomorrow', label: 'Demain' },
  { key: 'weekend', label: 'Ce week-end' },
  { key: 'week', label: 'Cette semaine' },
]

export interface ExploreFilters {
  when: WhenKey | null
  categories: string[]
  arrondissements: string[]
  intents: string[]
  free: boolean
  under20: boolean
}

export const EMPTY_FILTERS: ExploreFilters = { when: null, categories: [], arrondissements: [], intents: [], free: false, under20: false }

export function countActiveFilters(f: ExploreFilters): number {
  return Number(!!f.when) + f.categories.length + f.arrondissements.length + f.intents.length + Number(f.free) + Number(f.under20 && !f.free)
}

/** Filtres (+ recherche) → chaîne de paramètres au format du site. */
export function filtersToParams(f: ExploreFilters, q?: string | null): string {
  return buildEventParams({
    when: f.when,
    categories: f.categories,
    arrondissements: f.arrondissements,
    intents: f.intents,
    free: f.free,
    maxPrice: f.under20 && !f.free ? 20 : null,
    q: q?.trim() || null,
  }).toString()
}

export function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/** Valeur stabilisée après `ms` sans changement (suggestions pendant la frappe). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** « 11e » → « Paris 11e » ; « 1er » → « Paris 1er ». */
export function arrLabel(arr: string): string {
  return `Paris ${arr}`
}
