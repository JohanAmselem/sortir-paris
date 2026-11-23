/** Pure helpers for the Match deck (shared by API + client, unit-tested). */
import type { CardEvent } from '@/lib/events/types'

/** Swipes per Paris day, members and anonymous visitors alike. */
export const MATCH_DAILY_LIMIT = 30
/** Anonymous visitors are invited to create an account after this many swipes. */
export const MATCH_SIGNUP_NUDGE_AT = 8
/** Max local swipes imported after login. */
export const MATCH_IMPORT_MAX = 60

/**
 * Round-robin across categories so the deck alternates (concert, expo,
 * théâtre…) while keeping each category's own ranking. Duplicates and
 * excluded ids are dropped.
 */
export function interleaveByCategory(events: CardEvent[], exclude: Iterable<string> = [], max = 30): CardEvent[] {
  const skip = new Set(exclude)
  const seen = new Set<string>()
  const buckets = new Map<string, CardEvent[]>()
  for (const e of events) {
    if (skip.has(e.id) || seen.has(e.id)) continue
    seen.add(e.id)
    const key = e.category?.slug ?? 'autre'
    const list = buckets.get(key)
    if (list) list.push(e)
    else buckets.set(key, [e])
  }
  const queues = [...buckets.values()]
  const out: CardEvent[] = []
  while (out.length < max && queues.some((q) => q.length)) {
    for (const q of queues) {
      const next = q.shift()
      if (next) out.push(next)
      if (out.length >= max) break
    }
  }
  return out
}

/** Category slug → count, from local swipes (anonymous signals). */
export function countCategories(swipes: Array<{ category: string | null; direction: 'left' | 'right' }>) {
  const liked: Record<string, number> = {}
  const disliked: Record<string, number> = {}
  for (const s of swipes) {
    if (!s.category) continue
    const target = s.direction === 'right' ? liked : disliked
    target[s.category] = (target[s.category] ?? 0) + 1
  }
  return { liked, disliked }
}
