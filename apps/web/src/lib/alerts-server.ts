/**
 * Artist alerts sender (server only), called by POST /api/cron/alerts.
 *
 * A handful of batched, LIMITed reads (each under a server-side statement
 * timeout), then one e-mail and one push notification per member. Deliveries
 * are recorded only after at least one channel succeeded, so a failed run is
 * simply retried by the next one.
 */
import 'server-only'
import { and, eq, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'
import {
  alertDeliveries,
  alertSettings,
  categories,
  db,
  eventArtists,
  events,
  pushSubscriptions,
  userAttendances,
  userFollows,
  users,
  venues,
  withStatementTimeout,
} from '@sortir/db'
import {
  DEFAULT_ALERT_SETTINGS,
  MAX_EVENTS_PER_EMAIL,
  MAX_MEMBERS_PER_RUN,
  NEW_DATE_LOOKBACK_DAYS,
  ON_SALE_AFTER_MS,
  ON_SALE_BEFORE_MS,
  alertPushPayload,
  channelsFor,
  renderAlertEmail,
  selectItems,
  tomorrowWindow,
  type AlertEvent,
  type AlertItem,
  type AlertKind,
  type AlertSettingsValue,
} from './alerts'
import { deliveryKey, indexFollows, keysInTitle, maskEmail, newDateItems, onSaleItems, type ArtistFollowRow } from './alerts-collect'
import { pushConfigured, sendPush } from './push-server'
import { absoluteUrl, SITE_NAME } from './site'

const READ_TIMEOUT_MS = 8000
const MAX_FOLLOW_ROWS = 20_000
const MAX_EVENT_ROWS = 3000
const CHUNK = 500
/** Music categories for the title fallback (events without event_artists rows). */
const MUSIC_CATEGORIES = ['concerts', 'festivals']
/** Resend allows ~2 requests per second. */
const EMAIL_SPACING_MS = 550
/** Stop sending before the function's maxDuration (300 s). */
const TIME_BUDGET_MS = 240_000

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

const iso = (d: Date | string | null) => (d == null ? null : d instanceof Date ? d.toISOString() : String(d))

function chunks<T>(list: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

const eventCols = {
  id: events.id,
  slug: events.slug,
  title: events.title,
  startDate: events.startDate,
  timeKnown: events.timeKnown,
  bookingUrl: events.bookingUrl,
  onSaleAt: events.onSaleAt,
  venueName: venues.name,
}

type EventRow = {
  id: string
  slug: string
  title: string
  startDate: Date
  timeKnown: boolean
  bookingUrl: string | null
  onSaleAt: Date | null
  venueName: string | null
}

function toAlertEvent(r: EventRow): AlertEvent {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    startDate: iso(r.startDate)!,
    timeKnown: r.timeKnown,
    venueName: r.venueName,
    bookingUrl: r.bookingUrl,
    onSaleAt: iso(r.onSaleAt),
  }
}

export interface RunOptions {
  dryRun: boolean
  /** Restrict to some kinds (e.g. ['reminder'] for the morning run). */
  kinds: AlertKind[]
  now?: Date
}

export interface MemberPreview {
  user: string
  channels: string[]
  subject: string
  items: Array<{ kind: AlertKind; title: string; startDate: string; artist: string | null; slug: string }>
}

export interface RunStats {
  ok: boolean
  dryRun: boolean
  kinds: AlertKind[]
  configured: { email: boolean; push: boolean }
  reason?: string
  pending: Record<AlertKind, number>
  membersWithPending: number
  membersWithoutChannel: number
  membersProcessed: number
  emailsSent: number
  emailsFailed: number
  pushSent: number
  pushFailed: number
  pushRemoved: number
  deliveriesRecorded: number
  stoppedEarly: boolean
  preview?: MemberPreview[]
}

/** Pending items per member, before settings and channels. */
async function collect(kinds: AlertKind[], now: Date): Promise<Map<string, AlertItem[]>> {
  const perUser = new Map<string, AlertItem[]>()
  const push = (userId: string, item: AlertItem) => {
    const list = perUser.get(userId)
    if (list) list.push(item)
    else perUser.set(userId, [item])
  }
  const wantNew = kinds.includes('new_date')
  const wantSale = kinds.includes('on_sale')

  if (wantNew || wantSale) {
    const followRows = await withStatementTimeout(READ_TIMEOUT_MS, (tx) =>
      tx
        .select({ userId: userFollows.userId, term: userFollows.term, label: userFollows.label, createdAt: userFollows.createdAt })
        .from(userFollows)
        .where(eq(userFollows.kind, 'artist'))
        .limit(MAX_FOLLOW_ROWS)
    )
    const index = indexFollows(
      followRows.filter((r) => r.term).map((r): ArtistFollowRow => ({ userId: r.userId, term: r.term!, label: r.label, createdAt: iso(r.createdAt)! }))
    )
    const keys = [...index.byKey.keys()]
    const since = new Date(now.getTime() - NEW_DATE_LOOKBACK_DAYS * 86400_000)
    const saleFrom = new Date(now.getTime() - ON_SALE_BEFORE_MS)
    const saleTo = new Date(now.getTime() + ON_SALE_AFTER_MS)

    if (keys.length) {
      // 1. Events with artists (event_artists, idx_event_artists_key): new dates and ticket openings.
      const recent = wantNew ? gte(events.createdAt, since) : undefined
      const onSale = wantSale ? and(gte(events.onSaleAt, saleFrom), lte(events.onSaleAt, saleTo)) : undefined
      for (const chunk of chunks(keys)) {
        const rows = await withStatementTimeout(READ_TIMEOUT_MS, (tx) =>
          tx
            .select({ ...eventCols, key: eventArtists.artistKey, createdAt: events.createdAt })
            .from(eventArtists)
            .innerJoin(events, eq(events.id, eventArtists.eventId))
            .leftJoin(venues, eq(venues.id, events.venueId))
            .where(
              and(
                inArray(eventArtists.artistKey, chunk),
                eq(events.status, 'active'),
                isNull(events.canonicalEventId),
                gte(events.startDate, now),
                or(recent, onSale)
              )
            )
            .limit(MAX_EVENT_ROWS)
        )
        for (const r of rows) {
          const event = toAlertEvent(r)
          if (wantNew && r.createdAt >= since) for (const x of newDateItems(r.key, event, iso(r.createdAt)!, index)) push(x.userId, x.item)
          if (wantSale && r.onSaleAt && r.onSaleAt >= saleFrom && r.onSaleAt <= saleTo)
            for (const x of onSaleItems(r.key, event, index)) push(x.userId, x.item)
        }
      }

      // 2. New music events without event_artists rows: whole-word match of the title.
      if (wantNew) {
        const rows = await withStatementTimeout(READ_TIMEOUT_MS, (tx) =>
          tx
            .select({ ...eventCols, createdAt: events.createdAt })
            .from(events)
            .innerJoin(categories, eq(categories.id, events.categoryId))
            .leftJoin(venues, eq(venues.id, events.venueId))
            .where(
              and(
                eq(events.status, 'active'),
                isNull(events.canonicalEventId),
                gte(events.startDate, now),
                gte(events.createdAt, since),
                inArray(categories.slug, MUSIC_CATEGORIES),
                sql`not exists (select 1 from event_artists ea where ea.event_id = ${events.id})`
              )
            )
            .limit(MAX_EVENT_ROWS)
        )
        for (const r of rows) {
          const matched = keysInTitle(r.title, index)
          if (!matched.length) continue
          const event = toAlertEvent(r)
          for (const key of matched) for (const x of newDateItems(key, event, iso(r.createdAt)!, index)) push(x.userId, x.item)
        }
      }
    }
  }

  // 3. Reminders: « J'y vais » for an event starting tomorrow (Paris).
  if (kinds.includes('reminder')) {
    const t = tomorrowWindow(now)
    const rows = await withStatementTimeout(READ_TIMEOUT_MS, (tx) =>
      tx
        .select({ ...eventCols, userId: userAttendances.userId })
        .from(events)
        .innerJoin(userAttendances, eq(userAttendances.eventId, events.id))
        .leftJoin(venues, eq(venues.id, events.venueId))
        .where(and(eq(events.status, 'active'), gte(events.startDate, t.start), lt(events.startDate, t.end)))
        .limit(MAX_EVENT_ROWS * 2)
    )
    for (const r of rows) push(r.userId, { kind: 'reminder', event: toAlertEvent(r), artist: null })
  }
  return perUser
}

interface MemberInfo {
  settings: AlertSettingsValue
  token: string | null
  email: string | null
  subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>
}

async function loadMembers(userIds: string[]): Promise<Map<string, MemberInfo>> {
  const info = new Map<string, MemberInfo>(userIds.map((id) => [id, { settings: DEFAULT_ALERT_SETTINGS, token: null, email: null, subs: [] }]))
  for (const chunk of chunks(userIds)) {
    const [settings, emails, subs] = await withStatementTimeout(READ_TIMEOUT_MS, async (tx) => [
      await tx.select().from(alertSettings).where(inArray(alertSettings.userId, chunk)).limit(chunk.length),
      await tx.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, chunk)).limit(chunk.length),
      await tx
        .select({ id: pushSubscriptions.id, userId: pushSubscriptions.userId, endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
        .from(pushSubscriptions)
        .where(inArray(pushSubscriptions.userId, chunk))
        .limit(chunk.length * 10),
    ] as const)
    for (const s of settings) {
      const m = info.get(s.userId)!
      m.settings = {
        emailEnabled: s.emailEnabled,
        pushEnabled: s.pushEnabled,
        notifyNewDate: s.notifyNewDate,
        notifyOnSale: s.notifyOnSale,
        notifyReminder: s.notifyReminder,
      }
      m.token = s.unsubscribeToken
    }
    for (const u of emails) info.get(u.id)!.email = u.email
    for (const s of subs) info.get(s.userId)!.subs.push(s)
  }
  return info
}

/** (member, event, kind) already sent. */
async function loadDelivered(userIds: string[], eventIds: string[]): Promise<Set<string>> {
  const done = new Set<string>()
  if (!userIds.length || !eventIds.length) return done
  for (const u of chunks(userIds)) {
    for (const e of chunks(eventIds, 1000)) {
      const rows = await withStatementTimeout(READ_TIMEOUT_MS, (tx) =>
        tx
          .select({ userId: alertDeliveries.userId, eventId: alertDeliveries.eventId, kind: alertDeliveries.kind })
          .from(alertDeliveries)
          .where(and(inArray(alertDeliveries.userId, u), inArray(alertDeliveries.eventId, e)))
          .limit(20_000)
      )
      for (const r of rows) done.add(deliveryKey(r.userId, r.eventId, r.kind))
    }
  }
  return done
}

/** Unsubscribe tokens for members without an alert_settings row (row created with defaults). */
async function ensureTokens(members: Map<string, MemberInfo>, userIds: string[]): Promise<void> {
  const missing = userIds.filter((id) => !members.get(id)!.token)
  if (!missing.length) return
  for (const chunk of chunks(missing)) {
    await db
      .insert(alertSettings)
      .values(chunk.map((userId) => ({ userId })))
      .onConflictDoNothing()
    const rows = await withStatementTimeout(READ_TIMEOUT_MS, (tx) =>
      tx.select({ userId: alertSettings.userId, token: alertSettings.unsubscribeToken }).from(alertSettings).where(inArray(alertSettings.userId, chunk)).limit(chunk.length)
    )
    for (const r of rows) members.get(r.userId)!.token = r.token
  }
}

/** One e-mail through Resend (fetch, no SDK). False when not configured or failed; never throws. */
export async function sendEmail(to: string, subject: string, html: string, text: string, unsubscribeUrl: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) return false
  const from = process.env.ALERTS_FROM || `${SITE_NAME} <alertes@panameclub.fr>`
  const body = JSON.stringify({
    from,
    to: [to],
    subject,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) return true
      if (res.status === 429 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1200))
        continue
      }
      console.error('[alerts] resend status', res.status)
      return false
    } catch (err) {
      console.error('[alerts] resend failed', err)
      return false
    }
  }
  return false
}

export const unsubscribePageUrl = (token: string) => absoluteUrl(`/alertes/desinscription?token=${encodeURIComponent(token)}`)
export const unsubscribeApiUrl = (token: string) => absoluteUrl(`/api/alerts/unsubscribe?token=${encodeURIComponent(token)}`)

export async function runAlerts(opts: RunOptions): Promise<RunStats> {
  const started = Date.now()
  const now = opts.now ?? new Date()
  const configured = { email: emailConfigured(), push: pushConfigured() }
  const stats: RunStats = {
    ok: true,
    dryRun: opts.dryRun,
    kinds: opts.kinds,
    configured,
    pending: { new_date: 0, on_sale: 0, reminder: 0 },
    membersWithPending: 0,
    membersWithoutChannel: 0,
    membersProcessed: 0,
    emailsSent: 0,
    emailsFailed: 0,
    pushSent: 0,
    pushFailed: 0,
    pushRemoved: 0,
    deliveriesRecorded: 0,
    stoppedEarly: false,
  }
  if (!configured.email && !configured.push && !opts.dryRun) {
    return { ...stats, ok: false, reason: 'Aucun canal configuré (RESEND_API_KEY ou clés VAPID manquantes) : rien n’a été envoyé.' }
  }

  const perUser = await collect(opts.kinds, now)
  const userIds = [...perUser.keys()]
  if (!userIds.length) return stats
  const eventIds = [...new Set([...perUser.values()].flat().map((i) => i.event.id))]
  const [members, delivered] = await Promise.all([loadMembers(userIds), loadDelivered(userIds, eventIds)])

  // Per member: what is still to send, through which channels.
  type Plan = { userId: string; items: AlertItem[]; channels: { email: boolean; push: boolean } }
  const plans: Plan[] = []
  for (const [userId, all] of perUser) {
    const m = members.get(userId)!
    const items = selectItems(
      all.filter((i) => !delivered.has(deliveryKey(userId, i.event.id, i.kind))),
      m.settings,
      MAX_EVENTS_PER_EMAIL
    )
    if (!items.length) continue
    stats.membersWithPending++
    for (const i of items) stats.pending[i.kind]++
    const channels = channelsFor(m.settings, {
      // Dry run: show what would go out once the channels are configured.
      emailConfigured: configured.email || opts.dryRun,
      pushConfigured: configured.push || opts.dryRun,
      hasEmail: Boolean(m.email),
      pushSubscriptions: m.subs.length,
    })
    if (!channels.email && !channels.push) {
      stats.membersWithoutChannel++
      continue
    }
    plans.push({ userId, items, channels })
  }
  // Time-sensitive first (reminders, ticket openings), then the rest.
  plans.sort((a, b) => Number(b.items.some((i) => i.kind !== 'new_date')) - Number(a.items.some((i) => i.kind !== 'new_date')))
  const batch = plans.slice(0, MAX_MEMBERS_PER_RUN)

  if (opts.dryRun) {
    stats.membersProcessed = batch.length
    stats.preview = batch.map((p) => ({
      user: members.get(p.userId)!.email ? maskEmail(members.get(p.userId)!.email!) : p.userId.slice(0, 8),
      channels: [p.channels.email && 'email', p.channels.push && 'push'].filter(Boolean) as string[],
      subject: renderAlertEmail(p.items, { absoluteUrl, unsubscribeUrl: '', settingsUrl: '' }, now).subject,
      items: p.items.map((i) => ({ kind: i.kind, title: i.event.title, startDate: i.event.startDate, artist: i.artist, slug: i.event.slug })),
    }))
    return stats
  }

  await ensureTokens(
    members,
    batch.filter((p) => p.channels.email).map((p) => p.userId)
  )

  for (const p of batch) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      stats.stoppedEarly = true
      break
    }
    const m = members.get(p.userId)!
    const sent: string[] = []

    const emailTask = (async () => {
      if (!p.channels.email || !m.email || !m.token) return
      const mail = renderAlertEmail(p.items, { absoluteUrl, unsubscribeUrl: unsubscribePageUrl(m.token), settingsUrl: absoluteUrl('/compte/artistes') }, now)
      const ok = await sendEmail(m.email, mail.subject, mail.html, mail.text, unsubscribeApiUrl(m.token))
      if (ok) {
        stats.emailsSent++
        sent.push('email')
      } else stats.emailsFailed++
    })()

    const pushTask = (async () => {
      if (!p.channels.push) return
      const payload = alertPushPayload(p.items)
      const results = await Promise.all(m.subs.map((s) => sendPush(s, payload).then((r) => ({ s, r }))))
      const gone = results.filter((x) => x.r === 'gone').map((x) => x.s.id)
      const failed = results.filter((x) => x.r === 'error').map((x) => x.s.id)
      stats.pushSent += results.filter((x) => x.r === 'ok').length
      stats.pushFailed += failed.length
      try {
        if (gone.length) {
          await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone))
          stats.pushRemoved += gone.length
        }
        if (failed.length) await db.update(pushSubscriptions).set({ lastErrorAt: new Date() }).where(inArray(pushSubscriptions.id, failed))
      } catch (err) {
        console.error('[alerts] push cleanup failed', err)
      }
      if (results.some((x) => x.r === 'ok')) sent.push('push')
    })()

    await Promise.all([emailTask, pushTask])
    stats.membersProcessed++

    if (sent.length) {
      try {
        const rows = await db
          .insert(alertDeliveries)
          .values(p.items.map((i) => ({ userId: p.userId, eventId: i.event.id, kind: i.kind, channels: sent })))
          .onConflictDoNothing()
          .returning({ eventId: alertDeliveries.eventId })
        stats.deliveriesRecorded += rows.length
      } catch (err) {
        console.error('[alerts] deliveries insert failed', err)
      }
    }
    if (p.channels.email) await new Promise((r) => setTimeout(r, EMAIL_SPACING_MS))
  }
  return stats
}

/** Disable alert e-mails from an unsubscribe token. True when the token exists. */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  if (!/^[a-f0-9]{16,128}$/i.test(token)) return false
  const rows = await db
    .update(alertSettings)
    .set({ emailEnabled: false, updatedAt: new Date() })
    .where(eq(alertSettings.unsubscribeToken, token))
    .returning({ userId: alertSettings.userId })
  return rows.length > 0
}
