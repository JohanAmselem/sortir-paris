/**
 * Artist alerts: pure matching helpers used by the cron collector (no I/O).
 */
import { artistKey, isValidArtistKey } from './artists'
import type { AlertEvent, AlertItem, AlertKind } from './alerts'

export interface ArtistFollowRow {
  userId: string
  term: string
  label: string
  /** ISO */
  createdAt: string
}

export interface FollowerIndex {
  /** artist key → followers */
  byKey: Map<string, ArtistFollowRow[]>
  /** Longest key, in words (title scan). */
  maxWords: number
}

/** Follow terms reduced to artist keys (old title follows included). */
export function indexFollows(rows: ArtistFollowRow[]): FollowerIndex {
  const byKey = new Map<string, ArtistFollowRow[]>()
  let maxWords = 1
  for (const r of rows) {
    const key = artistKey(r.term)
    if (!isValidArtistKey(key)) continue
    const list = byKey.get(key)
    if (list) list.push(r)
    else byKey.set(key, [r])
    maxWords = Math.max(maxWords, key.split(' ').length)
  }
  return { byKey, maxWords }
}

/**
 * Followed keys found as whole words in a title: every run of 1..maxWords
 * consecutive words of the title's artist key is looked up in the index.
 */
export function keysInTitle(title: string, index: FollowerIndex): string[] {
  const words = artistKey(title).split(' ').filter(Boolean)
  const found = new Set<string>()
  for (let i = 0; i < words.length; i++) {
    let k = ''
    for (let n = 0; n < index.maxWords && i + n < words.length; n++) {
      k = n === 0 ? words[i] : `${k} ${words[i + n]}`
      if (index.byKey.has(k)) found.add(k)
    }
  }
  return [...found]
}

/**
 * new_date items for an event that matched `key`: one per follower who started
 * following before the event entered the catalogue.
 */
export function newDateItems(key: string, event: AlertEvent, createdAt: string, index: FollowerIndex): Array<{ userId: string; item: AlertItem }> {
  const added = new Date(createdAt).getTime()
  return (index.byKey.get(key) ?? [])
    .filter((f) => added > new Date(f.createdAt).getTime())
    .map((f) => ({ userId: f.userId, item: { kind: 'new_date' as const, event, artist: f.label } }))
}

/** on_sale items: every follower of the key. */
export function onSaleItems(key: string, event: AlertEvent, index: FollowerIndex): Array<{ userId: string; item: AlertItem }> {
  return (index.byKey.get(key) ?? []).map((f) => ({ userId: f.userId, item: { kind: 'on_sale' as const, event, artist: f.label } }))
}

export const deliveryKey = (userId: string, eventId: string, kind: AlertKind) => `${userId}:${eventId}:${kind}`

/** Hide most of an address in dry-run output ("jo***@gmail.com"). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  return `${local.slice(0, 2)}***@${domain}`
}
