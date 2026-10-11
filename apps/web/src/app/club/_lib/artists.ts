/**
 * Artist alerts: member-side data access (server only). Every read goes
 * through withStatementTimeout, is LIMITed and uses idx_event_artists_key.
 */
import 'server-only'
import { unstable_cache } from 'next/cache'
import { and, asc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { alertSettings, db, eventArtists, events, userFollows, venues, withStatementTimeout } from '@sortir/db'
import { STATEMENT_TIMEOUT_MS, withTimeout } from '@/lib/events/query'
import { DEFAULT_ALERT_SETTINGS, type AlertSettingsValue } from '@/lib/alerts'
import { ARTIST_KEY_MAX, artistDisplayName, artistKey, isValidArtistKey } from '@/lib/artists'
import { MAX_FOLLOWS } from '@/lib/follows'

export const SUGGEST_LIMIT = 8

export interface ArtistSuggestion {
  key: string
  name: string
  /** Upcoming live events in Paris. */
  dates: number
}

/**
 * Artists currently playing whose key starts with the query, or has a word
 * starting with it. event_artists is small (a few rows per concert); results
 * are cached per normalized query.
 */
async function loadSuggestions(q: string): Promise<ArtistSuggestion[]> {
  const esc = q.replace(/[\\%_]/g, (c) => '\\' + c)
  const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
    tx
      .select({
        key: eventArtists.artistKey,
        name: sql<string>`min(${eventArtists.name})`,
        dates: sql<number>`count(*)::int`,
      })
      .from(eventArtists)
      .innerJoin(events, eq(events.id, eventArtists.eventId))
      .where(
        and(
          sql`(${eventArtists.artistKey} like ${esc + '%'} or ${eventArtists.artistKey} like ${'% ' + esc + '%'})`,
          eq(events.status, 'active'),
          isNull(events.canonicalEventId),
          gte(events.startDate, sql`now()`)
        )
      )
      .groupBy(eventArtists.artistKey)
      // Exact and prefix matches first, then the busiest artists.
      .orderBy(sql`(${eventArtists.artistKey} like ${esc + '%'}) desc`, sql`count(*) desc`, asc(eventArtists.artistKey))
      .limit(SUGGEST_LIMIT)
  )
  return rows.map((r) => ({ key: r.key, name: r.name, dates: Number(r.dates) }))
}

const cachedSuggestions = unstable_cache(loadSuggestions, ['artist-suggest-v1'], { revalidate: 1800, tags: ['events'] })

export async function suggestArtists(raw: string): Promise<ArtistSuggestion[]> {
  const q = artistKey(raw.slice(0, 120)).slice(0, ARTIST_KEY_MAX).trim()
  if (q.length < 2) return []
  return withTimeout(cachedSuggestions(q), STATEMENT_TIMEOUT_MS + 1500, 'artistSuggest')
}

export interface ArtistDate {
  key: string
  slug: string
  title: string
  startDate: string
  timeKnown: boolean
  venueName: string | null
}

const MAX_DATES_ROWS = 300
export const DATES_PER_ARTIST = 3

/** Next Paris dates of the followed artists (event_artists), at most 3 per artist. */
export async function getArtistDates(keys: string[]): Promise<Map<string, ArtistDate[]>> {
  const valid = [...new Set(keys.filter(isValidArtistKey))]
  const out = new Map<string, ArtistDate[]>()
  if (!valid.length) return out
  const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
    tx
      .select({
        key: eventArtists.artistKey,
        slug: events.slug,
        title: events.title,
        startDate: events.startDate,
        timeKnown: events.timeKnown,
        venueName: venues.name,
      })
      .from(eventArtists)
      .innerJoin(events, eq(events.id, eventArtists.eventId))
      .leftJoin(venues, eq(venues.id, events.venueId))
      .where(
        and(inArray(eventArtists.artistKey, valid), eq(events.status, 'active'), isNull(events.canonicalEventId), gte(events.startDate, sql`now()`))
      )
      .orderBy(asc(events.startDate))
      .limit(MAX_DATES_ROWS)
  )
  for (const r of rows) {
    const list = out.get(r.key) ?? []
    if (list.length >= DATES_PER_ARTIST) continue
    list.push({
      key: r.key,
      slug: r.slug,
      title: r.title,
      startDate: r.startDate instanceof Date ? r.startDate.toISOString() : String(r.startDate),
      timeKnown: r.timeKnown,
      venueName: r.venueName,
    })
    out.set(r.key, list)
  }
  return out
}

/** Artists of one event (event pages), cached with the page data. */
async function loadEventArtists(eventId: string): Promise<Array<{ key: string; name: string }>> {
  const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
    tx
      .select({ key: eventArtists.artistKey, name: eventArtists.name, origin: eventArtists.origin })
      .from(eventArtists)
      .where(eq(eventArtists.eventId, eventId))
      .limit(12)
  )
  // Source-given artists first (headliner order is not stored: keep it stable).
  return rows
    .sort((a, b) => Number(b.origin === 'source') - Number(a.origin === 'source') || a.name.localeCompare(b.name, 'fr'))
    .map(({ key, name }) => ({ key, name }))
}

const cachedEventArtists = unstable_cache(loadEventArtists, ['event-artists-v1'], { revalidate: 3600, tags: ['events'] })

/** Never throws: the artists line is optional on the page. */
export async function safeGetEventArtists(eventId: string): Promise<Array<{ key: string; name: string }>> {
  try {
    return await withTimeout(cachedEventArtists(eventId), STATEMENT_TIMEOUT_MS + 1500, 'eventArtists')
  } catch (err) {
    console.error('[event artists]', err)
    return []
  }
}

/** The member's alert settings (defaults without a row). */
export async function getAlertSettings(userId: string): Promise<AlertSettingsValue> {
  const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
    tx
      .select({
        emailEnabled: alertSettings.emailEnabled,
        pushEnabled: alertSettings.pushEnabled,
        notifyNewDate: alertSettings.notifyNewDate,
        notifyOnSale: alertSettings.notifyOnSale,
        notifyReminder: alertSettings.notifyReminder,
      })
      .from(alertSettings)
      .where(eq(alertSettings.userId, userId))
      .limit(1)
  )
  return rows[0] ?? DEFAULT_ALERT_SETTINGS
}

/**
 * Follow several artists at once (Spotify import). Keeps MAX_FOLLOWS, skips
 * artists already followed; returns how many were added and how many did not fit.
 */
export async function followArtists(
  userId: string,
  artists: Array<{ name: string }>
): Promise<{ added: number; skipped: number; already: number }> {
  const wanted = new Map<string, string>()
  for (const a of artists) {
    const name = artistDisplayName(a.name)
    const key = artistKey(name)
    if (isValidArtistKey(key) && !wanted.has(key)) wanted.set(key, name.slice(0, 160))
  }
  if (!wanted.size) return { added: 0, skipped: 0, already: 0 }
  const existing = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
    tx
      .select({ kind: userFollows.kind, term: userFollows.term })
      .from(userFollows)
      .where(eq(userFollows.userId, userId))
      .limit(MAX_FOLLOWS + 50)
  )
  const terms = new Set(existing.filter((f) => f.kind === 'artist' && f.term).map((f) => f.term!))
  const fresh = [...wanted].filter(([key]) => !terms.has(key))
  const room = Math.max(0, MAX_FOLLOWS - existing.length)
  const toAdd = fresh.slice(0, room)
  let added = 0
  if (toAdd.length) {
    const rows = await db
      .insert(userFollows)
      .values(toAdd.map(([term, label]) => ({ userId, kind: 'artist' as const, venueId: null, term, label })))
      .onConflictDoNothing()
      .returning({ id: userFollows.id })
    added = rows.length
  }
  return { added, skipped: fresh.length - toAdd.length, already: wanted.size - fresh.length }
}
