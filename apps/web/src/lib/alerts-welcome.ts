/**
 * « Ton alerte est activée »: the one-time welcome e-mail sent when a member
 * creates their first alert (pure part, unit-tested). Sending and the
 * "already sent" marker (the alert_settings row) live in lib/follow-server.ts.
 */
import { escapeHtml, type RenderedEmail } from './alerts'
import { formatLongDay, formatTime } from './paris-time'

export const WELCOME_MAX_TARGETS = 10
export const WELCOME_DATES_PER_ARTIST = 3
/** Follows created within this window count as "first alerts" (one click, or a Spotify import). */
export const WELCOME_FRESH_WINDOW_MS = 15 * 60_000

export interface WelcomeDate {
  slug: string
  title: string
  /** ISO */
  startDate: string
  timeKnown: boolean
  venueName: string | null
}

export interface WelcomeTarget {
  kind: 'artist' | 'venue'
  label: string
  /** Next Paris dates (artists only). */
  dates: WelcomeDate[]
}

export interface WelcomeLinks {
  absoluteUrl: (path: string) => string
  settingsUrl: string
  unsubscribeUrl: string
  landingUrl: string
}

/**
 * Welcome only a brand-new alert member: no alert_settings row yet (the row is
 * the "welcome sent" marker) and every follow created in the last minutes, so
 * members who followed before this e-mail existed are not greeted years later.
 */
export function shouldSendWelcome(opts: {
  hasSettingsRow: boolean
  followCreatedAts: Array<Date | string>
  now: Date
  windowMs?: number
}): boolean {
  if (opts.hasSettingsRow || !opts.followCreatedAts.length) return false
  const from = opts.now.getTime() - (opts.windowMs ?? WELCOME_FRESH_WINDOW_MS)
  return opts.followCreatedAts.every((d) => new Date(d).getTime() >= from)
}

function whenText(d: WelcomeDate, now: Date): string {
  const start = new Date(d.startDate)
  const day = formatLongDay(start, now)
  return [d.timeKnown ? `${day} à ${formatTime(start)}` : day, d.venueName].filter(Boolean).join(' · ')
}

export function welcomeSubject(targets: WelcomeTarget[]): string {
  if (targets.length === 1) return `Ton alerte est activée : ${targets[0].label}`
  return `Tes alertes sont activées : ${targets.length} artistes et lieux suivis`
}

export function renderWelcomeEmail(all: WelcomeTarget[], links: WelcomeLinks, now: Date): RenderedEmail {
  const targets = all.slice(0, WELCOME_MAX_TARGETS)
  const more = all.length - targets.length
  const subject = welcomeSubject(all)
  const text: string[] = ['Salut !', '', all.length === 1 ? 'Ton alerte est activée.' : 'Tes alertes sont activées.', '']
  const html: string[] = [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;line-height:1.5">',
    '<p style="font-size:15px">Salut !</p>',
    `<h1 style="font-size:22px;margin:8px 0 4px">${all.length === 1 ? 'Ton alerte est activée' : 'Tes alertes sont activées'}</h1>`,
    '<p style="font-size:15px;color:#444">On te prévient par e-mail dès qu’une nouvelle date est annoncée à Paris, quand la billetterie ouvre, et la veille des concerts où tu as dit « J’y vais ». Un seul message groupé, jamais de spam.</p>',
  ]

  for (const t of targets) {
    text.push(t.label.toUpperCase())
    html.push(
      '<div style="padding:12px 0;border-top:1px solid #e5e5e5">',
      `<div style="font-size:16px;font-weight:600">${escapeHtml(t.label)}</div>`
    )
    if (t.kind === 'venue') {
      text.push('  Toutes les nouvelles dates de ce lieu.')
      html.push('<div style="font-size:14px;color:#555">Toutes les nouvelles dates de ce lieu.</div>')
    } else if (!t.dates.length) {
      text.push('  Pas de date à Paris pour l’instant : on te prévient dès qu’une date est annoncée.')
      html.push('<div style="font-size:14px;color:#555">Pas de date à Paris pour l’instant : on te prévient dès qu’une date est annoncée.</div>')
    } else {
      for (const d of t.dates.slice(0, WELCOME_DATES_PER_ARTIST)) {
        const page = links.absoluteUrl(`/evenements/${d.slug}`)
        text.push(`  - ${whenText(d, now)}`, `    ${page}`)
        html.push(
          `<div style="font-size:14px;margin-top:4px"><a href="${escapeHtml(page)}" style="color:#7c3aed;text-decoration:none">${escapeHtml(whenText(d, now))}</a></div>`
        )
      }
    }
    html.push('</div>')
    text.push('')
  }
  if (more > 0) {
    text.push(`… et ${more} autre${more > 1 ? 's' : ''}.`, '')
    html.push(`<p style="font-size:14px;color:#555">… et ${more} autre${more > 1 ? 's' : ''}.</p>`)
  }

  text.push(
    `Gérer mes artistes et mes alertes : ${links.settingsUrl}`,
    `Comment ça marche : ${links.landingUrl}`,
    '',
    'Tu reçois ce message parce que tu viens d’activer une alerte sur Paname Club.',
    `Ne plus recevoir les alertes par e-mail : ${links.unsubscribeUrl}`
  )
  html.push(
    `<p style="margin:24px 0"><a href="${escapeHtml(links.settingsUrl)}" style="display:inline-block;background:#7c3aed;color:#fff;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:999px">Gérer mes artistes</a></p>`,
    `<p style="font-size:14px;color:#555">Tu peux aussi activer les notifications sur ton téléphone depuis <a href="${escapeHtml(links.settingsUrl)}" style="color:#7c3aed">Mes artistes</a>. <a href="${escapeHtml(links.landingUrl)}" style="color:#7c3aed">Comment ça marche</a></p>`,
    `<p style="font-size:12px;color:#777;margin-top:32px;border-top:1px solid #e5e5e5;padding-top:12px">Tu reçois ce message parce que tu viens d’activer une alerte sur Paname Club.<br><a href="${escapeHtml(
      links.unsubscribeUrl
    )}" style="color:#777">Ne plus recevoir les alertes par e-mail</a></p>`,
    '</div>'
  )
  return { subject, html: html.join(''), text: text.join('\n') }
}
