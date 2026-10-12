import { describe, expect, it } from 'vitest'
import { renderWelcomeEmail, shouldSendWelcome, welcomeSubject, WELCOME_MAX_TARGETS, type WelcomeTarget } from './alerts-welcome'
import { ALERTS_FAQ, faqJsonLd } from './alerts-landing'

const now = new Date('2026-10-13T10:00:00Z')
const links = {
  absoluteUrl: (p: string) => `https://www.panameclub.fr${p}`,
  settingsUrl: 'https://www.panameclub.fr/compte/artistes',
  unsubscribeUrl: 'https://www.panameclub.fr/alertes/desinscription?token=abc',
  landingUrl: 'https://www.panameclub.fr/alertes-concerts',
}

describe('shouldSendWelcome', () => {
  const fresh = new Date(now.getTime() - 60_000)
  const old = new Date('2025-01-01T00:00:00Z')

  it('sends for a first follow without settings row', () => {
    expect(shouldSendWelcome({ hasSettingsRow: false, followCreatedAts: [fresh], now })).toBe(true)
  })

  it('sends for a fresh bulk import', () => {
    expect(shouldSendWelcome({ hasSettingsRow: false, followCreatedAts: [fresh, fresh, fresh.toISOString()], now })).toBe(true)
  })

  it('never twice (the settings row is the marker)', () => {
    expect(shouldSendWelcome({ hasSettingsRow: true, followCreatedAts: [fresh], now })).toBe(false)
  })

  it('not for members who followed before', () => {
    expect(shouldSendWelcome({ hasSettingsRow: false, followCreatedAts: [old, fresh], now })).toBe(false)
  })

  it('not without follows', () => {
    expect(shouldSendWelcome({ hasSettingsRow: false, followCreatedAts: [], now })).toBe(false)
  })
})

describe('renderWelcomeEmail', () => {
  const cure: WelcomeTarget = {
    kind: 'artist',
    label: 'The Cure',
    dates: [{ slug: 'the-cure-accor', title: 'The Cure', startDate: '2026-11-20T19:30:00Z', timeKnown: true, venueName: 'Accor Arena' }],
  }

  it('lists the artist, its dates and the links', () => {
    const mail = renderWelcomeEmail([cure], links, now)
    expect(mail.subject).toBe('Ton alerte est activée : The Cure')
    expect(mail.text).toContain('THE CURE')
    expect(mail.text).toContain('Accor Arena')
    expect(mail.text).toContain('https://www.panameclub.fr/evenements/the-cure-accor')
    expect(mail.text).toContain(links.settingsUrl)
    expect(mail.text).toContain(links.unsubscribeUrl)
    expect(mail.html).toContain(links.unsubscribeUrl)
  })

  it('says when there is no date yet', () => {
    const mail = renderWelcomeEmail([{ kind: 'artist', label: 'Inconnu', dates: [] }], links, now)
    expect(mail.text).toContain('on te prévient dès qu’une date est annoncée')
  })

  it('escapes names in HTML', () => {
    const mail = renderWelcomeEmail([{ kind: 'artist', label: '<b>Évil</b>', dates: [] }], links, now)
    expect(mail.html).not.toContain('<b>Évil</b>')
    expect(mail.html).toContain('&lt;b&gt;Évil&lt;/b&gt;')
  })

  it('caps the list and counts the rest', () => {
    const many = Array.from({ length: WELCOME_MAX_TARGETS + 3 }, (_, i): WelcomeTarget => ({ kind: 'artist', label: `Artiste ${i}`, dates: [] }))
    const mail = renderWelcomeEmail(many, links, now)
    expect(welcomeSubject(many)).toContain(`${many.length}`)
    expect(mail.text).toContain('… et 3 autres.')
    expect(mail.text).not.toContain(`ARTISTE ${WELCOME_MAX_TARGETS}`)
  })
})

describe('FAQ JSON-LD', () => {
  it('mirrors the FAQ', () => {
    const ld = faqJsonLd()
    expect(ld['@type']).toBe('FAQPage')
    expect(ld.mainEntity).toHaveLength(ALERTS_FAQ.length)
    expect(ld.mainEntity[0]).toEqual({ '@type': 'Question', name: ALERTS_FAQ[0].q, acceptedAnswer: { '@type': 'Answer', text: ALERTS_FAQ[0].a } })
    expect(ALERTS_FAQ.length).toBeGreaterThanOrEqual(6)
    expect(ALERTS_FAQ.length).toBeLessThanOrEqual(8)
  })

  it('never claims every concert', () => {
    const text = ALERTS_FAQ.map((f) => f.a).join(' ').replace(/pas tous les concerts/gi, '')
    expect(text).not.toMatch(/tous les concerts/i)
  })
})
