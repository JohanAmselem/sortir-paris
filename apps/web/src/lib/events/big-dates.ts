/**
 * « Les grosses dates » : les grandes salles d'abord, réparties sur les mois à
 * venir. Pur (testé sans base) ; utilisé par lib/home-v2.ts.
 */
import { foldText } from './fold'
import type { CardEvent } from './types'

/** Size of the hall: arenas and stadiums first, then the big concert halls. */
const ARENAS = /accor ?arena|bercy|defense arena|adidas arena|arena porte de la chapelle|stade de france|zenith|parc des princes|seine musicale|palais des congres|dome de paris|^(l.)?olympia/
const BIG_HALLS = /casino de paris|folies bergere|grand rex|bataclan|cigale|trianon|elysee montmartre|salle pleyel|philharmonie|chatelet|opera|alhambra|bobino|theatre de paris|palais des sports|salle gaveau/

export function hallTier(venueName: string | null | undefined): number {
  const v = foldText(venueName ?? '')
  if (ARENAS.test(v)) return 3
  if (BIG_HALLS.test(v)) return 2
  return 1
}

/**
 * Round-robin over the months (biggest halls first within a month, then newly
 * announced dates), so the block reaches far ahead instead of filling up with
 * next week. Shown in date order.
 */
export function spreadOverMonths(perMonth: CardEvent[][], max: number): CardEvent[] {
  const rank = (e: CardEvent) => hallTier(e.venue?.name) * 2 + Number(Boolean(e.isNew))
  const queues = perMonth.map((list) => [...list].sort((a, b) => rank(b) - rank(a)))
  const out: CardEvent[] = []
  const seen = new Set<string>()
  for (let round = 0; out.length < max && queues.some((q) => q.length); round++) {
    for (const q of queues) {
      while (q.length) {
        const e = q.shift()!
        const key = e.title.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(e)
        break
      }
      if (out.length >= max) break
    }
  }
  return out.sort((a, b) => a.startDate.localeCompare(b.startDate))
}
