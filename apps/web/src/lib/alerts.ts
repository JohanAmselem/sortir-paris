/**
 * Artist alerts: pure part (no database, no network), unit-tested.
 * The cron (/api/cron/alerts) collects pending items in a few batched queries
 * (app/api/cron/alerts/collect.ts), then this file decides what each member
 * receives and renders the e-mail and the push notification.
 */
import { formatLongDay, formatTime, parisDate, parisNightDay } from './paris-time'
import { safeUrl } from './format'

export type AlertKind = 'new_date' | 'on_sale' | 'reminder'
export const ALERT_KINDS: AlertKind[] = ['new_date', 'on_sale', 'reminder']

export interface AlertSettingsValue {
  emailEnabled: boolean
  pushEnabled: boolean
  notifyNewDate: boolean
  notifyOnSale: boolean
  notifyReminder: boolean
}

/** No alert_settings row: e-mail on, push off, every moment on. */
export const DEFAULT_ALERT_SETTINGS: AlertSettingsValue = {
  emailEnabled: true,
  pushEnabled: false,
  notifyNewDate: true,
  notifyOnSale: true,
  notifyReminder: true,
}

/** Members handled per cron run, events per e-mail. */
export const MAX_MEMBERS_PER_RUN = 200
export const MAX_EVENTS_PER_EMAIL = 20
/** new_date: only events added to the catalogue within this many days. */
export const NEW_DATE_LOOKBACK_DAYS = 7
/** on_sale: sales opening between now - 12 h and now + 36 h. */
export const ON_SALE_BEFORE_MS = 12 * 3600_000
export const ON_SALE_AFTER_MS = 36 * 3600_000

export interface AlertEvent {
  id: string
  slug: string
  title: string
  /** ISO */
  startDate: string
  timeKnown: boolean
  venueName: string | null
  bookingUrl: string | null
  /** ISO */
  onSaleAt: string | null
}

export interface AlertItem {
  kind: AlertKind
  event: AlertEvent
  /** Followed artist that triggered it (display name); null for reminders. */
  artist: string | null
}

export function wantsKind(s: AlertSettingsValue, kind: AlertKind): boolean {
  return kind === 'new_date' ? s.notifyNewDate : kind === 'on_sale' ? s.notifyOnSale : s.notifyReminder
}

const KIND_ORDER: Record<AlertKind, number> = { reminder: 0, on_sale: 1, new_date: 2 }

/**
 * What one member receives now: kinds they asked for, each (event, kind) once,
 * reminders first, then ticket openings, then new dates, soonest first; at most
 * `max` items (the rest waits for the next run, nothing is marked as sent).
 */
export function selectItems(items: AlertItem[], settings: AlertSettingsValue, max = MAX_EVENTS_PER_EMAIL): AlertItem[] {
  const seen = new Set<string>()
  return items
    .filter((it) => wantsKind(settings, it.kind))
    .filter((it) => {
      const k = `${it.event.id}:${it.kind}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        new Date(a.event.startDate).getTime() - new Date(b.event.startDate).getTime() ||
        a.event.id.localeCompare(b.event.id)
    )
    .slice(0, max)
}

/** Channels to use for a member, given settings and what is configured. */
export function channelsFor(
  settings: AlertSettingsValue,
  opts: { emailConfigured: boolean; pushConfigured: boolean; hasEmail: boolean; pushSubscriptions: number }
): { email: boolean; push: boolean } {
  return {
    email: settings.emailEnabled && opts.emailConfigured && opts.hasEmail,
    push: settings.pushEnabled && opts.pushConfigured && opts.pushSubscriptions > 0,
  }
}

/**
 * "Tomorrow" in Paris for the reminder: from 04:00 tomorrow to 04:00 the day
 * after (a 01:00 concert belongs to the evening before, as everywhere on the site).
 */
export function tomorrowWindow(now: Date): { start: Date; end: Date } {
  const d = parisNightDay(now)
  return { start: parisDate(d.year, d.month, d.day + 1, 4), end: parisDate(d.year, d.month, d.day + 2, 4) }
}

// ── Rendering ────────────────────────────────────────────────────────────────

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function when(e: AlertEvent, now: Date): string {
  const start = new Date(e.startDate)
  const day = formatLongDay(start, now)
  return e.timeKnown ? `${day} à ${formatTime(start)}` : day
}

function onSaleText(e: AlertEvent, now: Date): string {
  if (!e.onSaleAt) return 'Ouverture de la billetterie'
  const at = new Date(e.onSaleAt)
  return at.getTime() <= now.getTime()
    ? 'Billetterie ouverte'
    : `Billetterie ouverte ${formatLongDay(at, now)} à ${formatTime(at)}`
}

function itemLine(it: AlertItem, now: Date): string {
  const parts = [when(it.event, now), it.event.venueName].filter(Boolean)
  if (it.kind === 'on_sale') parts.unshift(onSaleText(it.event, now))
  return parts.join(' · ')
}

const SECTION_TITLES: Record<AlertKind, string> = {
  reminder: 'C’est demain',
  on_sale: 'Ouverture de la billetterie',
  new_date: 'Nouvelles dates à Paris',
}

export function alertSubject(items: AlertItem[]): string {
  const reminders = items.filter((i) => i.kind === 'reminder')
  const onSale = items.filter((i) => i.kind === 'on_sale')
  const newDates = items.filter((i) => i.kind === 'new_date')
  if (items.length === 1) {
    const it = items[0]
    if (it.kind === 'reminder') return `Demain : ${it.event.title}`
    if (it.kind === 'on_sale') return `Billetterie : ${it.artist ?? it.event.title}`
    return `Nouvelle date : ${it.artist ?? it.event.title} à Paris`
  }
  const bits: string[] = []
  if (reminders.length) bits.push(`${reminders.length} sortie${reminders.length > 1 ? 's' : ''} demain`)
  if (onSale.length) bits.push(`${onSale.length} billetterie${onSale.length > 1 ? 's' : ''} qui ouvre${onSale.length > 1 ? 'nt' : ''}`)
  if (newDates.length) bits.push(`${newDates.length} nouvelle${newDates.length > 1 ? 's' : ''} date${newDates.length > 1 ? 's' : ''}`)
  return `Tes artistes : ${bits.join(', ')}`
}

export interface EmailLinks {
  /** Absolute URL of a site path. */
  absoluteUrl: (path: string) => string
  unsubscribeUrl: string
  settingsUrl: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/** One e-mail per member, grouped by kind, with event and booking links. */
export function renderAlertEmail(items: AlertItem[], links: EmailLinks, now: Date): RenderedEmail {
  const subject = alertSubject(items)
  const sections = (['reminder', 'on_sale', 'new_date'] as AlertKind[])
    .map((kind) => ({ kind, list: items.filter((i) => i.kind === kind) }))
    .filter((s) => s.list.length)

  const textParts: string[] = ['Salut !', '']
  const htmlParts: string[] = [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;line-height:1.5">',
    '<p style="font-size:15px">Salut !</p>',
  ]
  for (const s of sections) {
    textParts.push(SECTION_TITLES[s.kind].toUpperCase())
    htmlParts.push(`<h2 style="font-size:18px;margin:24px 0 8px">${escapeHtml(SECTION_TITLES[s.kind])}</h2>`)
    for (const it of s.list) {
      const page = links.absoluteUrl(`/evenements/${it.event.slug}`)
      const booking = safeUrl(it.event.bookingUrl)
      const line = itemLine(it, now)
      const who = it.artist && it.kind !== 'reminder' ? `${it.artist} : ` : ''
      textParts.push(`- ${who}${it.event.title}`, `  ${line}`, `  ${page}`)
      if (booking) textParts.push(`  Réserver : ${booking}`)
      htmlParts.push(
        '<div style="padding:12px 0;border-top:1px solid #e5e5e5">',
        it.artist && it.kind !== 'reminder'
          ? `<div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#7c3aed;font-weight:600">${escapeHtml(it.artist)}</div>`
          : '',
        `<a href="${escapeHtml(page)}" style="font-size:16px;font-weight:600;color:#1a1a1a;text-decoration:none">${escapeHtml(it.event.title)}</a>`,
        `<div style="font-size:14px;color:#555">${escapeHtml(line)}</div>`,
        `<div style="font-size:14px;margin-top:4px"><a href="${escapeHtml(page)}" style="color:#7c3aed">Voir la sortie</a>${
          booking ? ` · <a href="${escapeHtml(booking)}" style="color:#7c3aed">Réserver</a>` : ''
        }</div>`,
        '</div>'
      )
    }
    textParts.push('')
  }
  textParts.push(
    'Tu reçois ce message parce que tu suis ces artistes sur Paname Club.',
    `Gérer mes alertes : ${links.settingsUrl}`,
    `Ne plus recevoir ces e-mails : ${links.unsubscribeUrl}`
  )
  htmlParts.push(
    `<p style="font-size:12px;color:#777;margin-top:32px;border-top:1px solid #e5e5e5;padding-top:12px">Tu reçois ce message parce que tu suis ces artistes sur Paname Club.<br><a href="${escapeHtml(
      links.settingsUrl
    )}" style="color:#777">Gérer mes alertes</a> · <a href="${escapeHtml(links.unsubscribeUrl)}" style="color:#777">Ne plus recevoir ces e-mails</a></p>`,
    '</div>'
  )
  return { subject, html: htmlParts.join(''), text: textParts.join('\n') }
}

export interface PushPayload {
  title: string
  body: string
  url: string
}

/** One notification per member: the subject, the first events, a link. */
export function alertPushPayload(items: AlertItem[]): PushPayload {
  const title = alertSubject(items)
  const names = items.slice(0, 3).map((i) => (i.artist && i.kind !== 'reminder' ? i.artist : i.event.title))
  const more = items.length - names.length
  const body = (names.join(', ') + (more > 0 ? ` et ${more} autre${more > 1 ? 's' : ''}` : '')).slice(0, 180)
  const url = items.length === 1 ? `/evenements/${items[0].event.slug}` : '/compte/artistes'
  return { title: title.slice(0, 120), body, url }
}
