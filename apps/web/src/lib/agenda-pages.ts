/**
 * Pages mois indexables (`/agenda/2027-03`, `/agenda/2027-03/concerts`) : mois
 * valides et liste pour le sitemap. Pur.
 */
import { MAIN_CATEGORIES } from './agenda-view'
import { getMonthWindow, nextMonthKeys } from './paris-time'

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** Un mois déjà passé (« 2026-11 » en décembre) : sa page redirige vers l'Agenda. */
export function isPastMonth(ym: string, now: Date = new Date()): boolean {
  return /^\d{4}-\d{2}$/.test(ym) && ym < nextMonthKeys(1, now)[0]
}

/** Un mois que l'Agenda sait montrer (du mois en cours à 24 mois). */
export function validMonth(ym: string, now: Date = new Date()): boolean {
  return /^\d{4}-\d{2}$/.test(ym) && getMonthWindow(ym, now) !== null
}

/** « mars 2027 », toujours avec l'année (titres et référencement). */
export function monthWithYear(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS_FR[m - 1] ?? ym} ${y}`
}

/** Les 12 prochains mois, seuls et croisés avec les catégories principales. */
export function sitemapMonthPaths(now: Date = new Date()): string[] {
  const months = nextMonthKeys(12, now)
  return months.flatMap((m) => [`/agenda/${m}`, ...MAIN_CATEGORIES.map((c) => `/agenda/${m}/${c}`)])
}
