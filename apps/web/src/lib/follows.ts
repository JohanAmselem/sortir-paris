/**
 * Follows (lot 4B): a member follows a venue or an artist / work.
 * Pure helpers shared by the API, the account pages and a future notifier
 * (cron e-mail / push): no database access here, everything is unit-tested.
 */
import { ACCENTS_FROM, ACCENTS_TO } from './events/fold'
import type { CardEvent } from './events/types'

export const MAX_FOLLOWS = 100
/** "Nouveautés pour toi": at most this many events, all follows together. */
export const MAX_NEW_MATCHES = 30
/** "Dernières dates": followed items starting within this many days. */
export const LAST_DATES_DAYS = 7
export const MAX_LAST_DATES = 12
export const TERM_MIN = 3
export const TERM_MAX = 80

export type FollowKind = 'venue' | 'artist'

export interface Follow {
  id: string
  kind: FollowKind
  venueId: string | null
  term: string | null
  label: string
  /** Venue slug (venue follows), for links. */
  venueSlug?: string | null
  createdAt: string
  lastSeenAt: string
  lastNotifiedAt: string | null
}

/** A live event matching a follow, with the date it entered the catalogue. */
export interface FollowMatch {
  event: CardEvent
  /** events.created_at (ISO). */
  addedAt: string
}

/**
 * Same fold as the SQL search expression (translate(lower(x), FROM, TO)), so a
 * term matches the trigram-indexed text character for character. Whitespace is
 * collapsed and the term is trimmed of surrounding punctuation.
 */
export function normalizeTerm(input: string): string {
  let folded = ''
  for (const ch of input.toLowerCase()) {
    const i = ACCENTS_FROM.indexOf(ch)
    folded += i === -1 ? ch : ACCENTS_TO[i]
  }
  return folded
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:;,.!?'"«»()[\]|/]+|[\s\-–—:;,.!?'"«»()[\]|/]+$/g, '')
    .trim()
}

/** A usable term: at least 3 letters or digits (a trigram), at most 80 characters. */
export function isValidTerm(term: string): boolean {
  return term.length <= TERM_MAX && term.replace(/[^\p{L}\p{N}]/gu, '').length >= TERM_MIN
}

/**
 * The "artist / work" to follow from an event title: drops bracketed notes
 * ("(complet)", "[VOST]"), what follows a " | " and keeps at most 80 characters
 * cut on a word. Null when nothing meaningful is left.
 */
export function followableFromTitle(title: string): { term: string; label: string } | null {
  let label = title
    .replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ')
    .split(' | ')[0]
    .replace(/\s+/g, ' ')
    .trim()
  if (label.length > TERM_MAX) label = label.slice(0, TERM_MAX).replace(/\s+\S*$/, '')
  const term = normalizeTerm(label)
  if (!isValidTerm(term)) return null
  return { term, label: label.replace(/^[\s\-–—:;,.]+|[\s\-–—:;,.]+$/g, '') || label }
}

/**
 * LIKE pattern for a term: wildcards in the term are matched literally, and any
 * apostrophe matches both ' and ’ (sources disagree: "L’Invitation", "L'invitation").
 */
export function likePattern(term: string): string {
  return '%' + term.replace(/[\\%_]/g, (c) => '\\' + c).replace(/['’]/g, '_') + '%'
}

/** Stable key of a follow target (cache key of its matches). */
export function followKey(f: Pick<Follow, 'kind' | 'venueId' | 'term'>): string {
  return f.kind === 'venue' ? `venue:${f.venueId}` : `artist:${f.term}`
}

export interface FollowGroup {
  follow: Follow
  matches: FollowMatch[]
}

const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0)

/** Matches added after `since`, newest first. */
export function matchesSince(matches: FollowMatch[], since: string | null): FollowMatch[] {
  const t = time(since)
  return matches.filter((m) => time(m.addedAt) > t).sort((a, b) => time(b.addedAt) - time(a.addedAt))
}

/**
 * "Nouveautés pour toi": per follow, events added since it was last marked as
 * seen. At most `max` events overall (an event appears once, under the first
 * follow that matched it); groups without news are dropped.
 */
export function groupNewMatches(
  follows: Follow[],
  matchesByKey: Map<string, FollowMatch[]>,
  max = MAX_NEW_MATCHES
): FollowGroup[] {
  const seen = new Set<string>()
  const perFollow = follows.map((f) => ({
    follow: f,
    pool: matchesSince(matchesByKey.get(followKey(f)) ?? [], f.lastSeenAt),
    matches: [] as FollowMatch[],
  }))
  // Round-robin so one prolific venue cannot hide every other follow.
  let total = 0
  let progressed = true
  while (total < max && progressed) {
    progressed = false
    for (const g of perFollow) {
      while (g.pool.length) {
        const m = g.pool.shift()!
        if (seen.has(m.event.id)) continue
        seen.add(m.event.id)
        g.matches.push(m)
        total++
        progressed = true
        break
      }
      if (total >= max) break
    }
  }
  return perFollow.filter((g) => g.matches.length).map(({ follow, matches }) => ({ follow, matches }))
}

export interface LastDate {
  follow: Follow
  event: CardEvent
}

/** "Dernières dates": followed items whose event starts within the next 7 days, soonest first. */
export function lastDates(
  follows: Follow[],
  matchesByKey: Map<string, FollowMatch[]>,
  now: Date,
  days = LAST_DATES_DAYS,
  max = MAX_LAST_DATES
): LastDate[] {
  const from = now.getTime()
  const to = from + days * 86400_000
  const out: LastDate[] = []
  const seen = new Set<string>()
  for (const f of follows) {
    for (const m of matchesByKey.get(followKey(f)) ?? []) {
      const start = time(m.event.startDate)
      if (start < from || start > to || seen.has(m.event.id)) continue
      seen.add(m.event.id)
      out.push({ follow: f, event: m.event })
    }
  }
  return out.sort((a, b) => time(a.event.startDate) - time(b.event.startDate)).slice(0, max)
}

/**
 * For a future notifier (cron): what a follow should announce now — events
 * added since the last notification (or since the follow was created), never
 * events the member already marked as seen. Returns [] when nothing is new.
 */
export function pendingNotifications(follow: Follow, matches: FollowMatch[]): FollowMatch[] {
  const since = [follow.lastNotifiedAt ?? follow.createdAt, follow.lastSeenAt].reduce((a, b) => (time(a) > time(b) ? a : b))
  return matchesSince(matches, since)
}
