import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ALERT_SETTINGS,
  alertPushPayload,
  alertSubject,
  channelsFor,
  escapeHtml,
  renderAlertEmail,
  selectItems,
  tomorrowWindow,
  type AlertEvent,
  type AlertItem,
} from './alerts'
import { indexFollows, keysInTitle, maskEmail, newDateItems, onSaleItems } from './alerts-collect'
import { spotifyArtistNames, spotifyAuthorizeUrl } from './spotify'

function ev(id: string, startDate = '2026-11-20T19:00:00.000Z', extra: Partial<AlertEvent> = {}): AlertEvent {
  return {
    id,
    slug: `slug-${id}`,
    title: `Concert ${id}`,
    startDate,
    timeKnown: true,
    venueName: 'La Cigale',
    bookingUrl: 'https://tickets.example.com/x',
    onSaleAt: null,
    ...extra,
  }
}

const item = (kind: AlertItem['kind'], id: string, startDate?: string, artist: string | null = 'Artiste'): AlertItem => ({
  kind,
  event: ev(id, startDate),
  artist,
})

const now = new Date('2026-10-11T08:00:00.000Z')

describe('selectItems', () => {
  it('drops kinds the member turned off, dedupes, orders reminder → on_sale → new_date', () => {
    const items = [
      item('new_date', 'a', '2026-11-01T19:00:00Z'),
      item('on_sale', 'b'),
      item('reminder', 'c', '2026-10-12T19:00:00Z', null),
      item('new_date', 'a', '2026-11-01T19:00:00Z'),
      item('new_date', 'd', '2026-10-20T19:00:00Z'),
    ]
    expect(selectItems(items, DEFAULT_ALERT_SETTINGS).map((i) => `${i.kind}:${i.event.id}`)).toEqual([
      'reminder:c',
      'on_sale:b',
      'new_date:d',
      'new_date:a',
    ])
    expect(selectItems(items, { ...DEFAULT_ALERT_SETTINGS, notifyNewDate: false }).map((i) => i.kind)).toEqual(['reminder', 'on_sale'])
  })

  it('caps the number of items', () => {
    const many = Array.from({ length: 30 }, (_, i) => item('new_date', `e${i}`))
    expect(selectItems(many, DEFAULT_ALERT_SETTINGS, 20)).toHaveLength(20)
  })
})

describe('channelsFor', () => {
  it('uses e-mail by default, push only when enabled with a subscription', () => {
    const opts = { emailConfigured: true, pushConfigured: true, hasEmail: true, pushSubscriptions: 0 }
    expect(channelsFor(DEFAULT_ALERT_SETTINGS, opts)).toEqual({ email: true, push: false })
    expect(channelsFor({ ...DEFAULT_ALERT_SETTINGS, pushEnabled: true }, { ...opts, pushSubscriptions: 1 })).toEqual({ email: true, push: true })
    expect(channelsFor({ ...DEFAULT_ALERT_SETTINGS, emailEnabled: false }, opts)).toEqual({ email: false, push: false })
    expect(channelsFor(DEFAULT_ALERT_SETTINGS, { ...opts, emailConfigured: false })).toEqual({ email: false, push: false })
  })
})

describe('tomorrowWindow', () => {
  it('covers tomorrow 04:00 → the day after 04:00, Paris time', () => {
    const w = tomorrowWindow(now) // Sunday 11 Oct 2026, 10:00 Paris (CEST)
    expect(w.start.toISOString()).toBe('2026-10-12T02:00:00.000Z')
    expect(w.end.toISOString()).toBe('2026-10-13T02:00:00.000Z')
  })

  it('uses the night boundary (01:00 still belongs to the previous day)', () => {
    const w = tomorrowWindow(new Date('2026-10-11T23:30:00.000Z')) // Monday 01:30 Paris → night of Sunday
    expect(w.start.toISOString()).toBe('2026-10-12T02:00:00.000Z')
  })

  it('handles the switch to winter time', () => {
    const w = tomorrowWindow(new Date('2026-10-24T10:00:00.000Z')) // Sat 24 Oct; DST ends 25 Oct
    expect(w.start.toISOString()).toBe('2026-10-25T03:00:00.000Z')
    expect(w.end.toISOString()).toBe('2026-10-26T03:00:00.000Z')
  })
})

describe('rendering', () => {
  it('builds a subject for one or several alerts', () => {
    expect(alertSubject([item('new_date', 'a', undefined, 'Juliette Armanet')])).toBe('Nouvelle date : Juliette Armanet à Paris')
    expect(alertSubject([item('reminder', 'a', undefined, null)])).toBe('Demain : Concert a')
    expect(alertSubject([item('reminder', 'a', undefined, null), item('new_date', 'b'), item('new_date', 'c')])).toBe(
      'Tes artistes : 1 sortie demain, 2 nouvelles dates'
    )
  })

  it('renders an escaped HTML e-mail and a text version with links', () => {
    const items = [{ kind: 'new_date' as const, event: ev('a', undefined, { title: 'Rock <script>' }), artist: 'A&B' }]
    const mail = renderAlertEmail(
      items,
      { absoluteUrl: (p) => `https://www.panameclub.fr${p}`, unsubscribeUrl: 'https://www.panameclub.fr/alertes/desinscription?token=t', settingsUrl: 'https://www.panameclub.fr/compte/artistes' },
      now
    )
    expect(mail.html).toContain('Rock &lt;script&gt;')
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('A&amp;B')
    expect(mail.html).toContain('https://tickets.example.com/x')
    expect(mail.html).toContain('desinscription?token=t')
    expect(mail.text).toContain('https://www.panameclub.fr/evenements/slug-a')
    expect(mail.text).toContain('Réserver : https://tickets.example.com/x')
    expect(mail.text).toContain('Nouvelles dates à Paris'.toUpperCase())
  })

  it('never links an unsafe booking URL', () => {
    const items = [{ kind: 'new_date' as const, event: ev('a', undefined, { bookingUrl: 'javascript:alert(1)' }), artist: null }]
    const mail = renderAlertEmail(items, { absoluteUrl: (p) => p, unsubscribeUrl: 'u', settingsUrl: 's' }, now)
    expect(mail.html).not.toContain('javascript:')
    expect(mail.text).not.toContain('Réserver')
  })

  it('builds one push notification per member', () => {
    expect(alertPushPayload([item('new_date', 'a', undefined, 'Daft Punk')])).toEqual({
      title: 'Nouvelle date : Daft Punk à Paris',
      body: 'Daft Punk',
      url: '/evenements/slug-a',
    })
    const p = alertPushPayload([item('new_date', 'a', undefined, 'A'), item('new_date', 'b', undefined, 'B'), item('new_date', 'c', undefined, 'C'), item('on_sale', 'd', undefined, 'D')])
    expect(p.body).toBe('A, B, C et 1 autre')
    expect(p.url).toBe('/compte/artistes')
  })

  it('escapes HTML', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })
})

describe('collect helpers', () => {
  const index = indexFollows([
    { userId: 'u1', term: 'ac dc', label: 'AC/DC', createdAt: '2026-10-01T00:00:00Z' },
    { userId: 'u2', term: 'ac/dc', label: 'AC/DC', createdAt: '2026-10-10T00:00:00Z' },
    { userId: 'u1', term: 'juliette armanet', label: 'Juliette Armanet', createdAt: '2026-10-01T00:00:00Z' },
    { userId: 'u3', term: 'x', label: 'X', createdAt: '2026-10-01T00:00:00Z' },
  ])

  it('indexes follows by artist key (old title terms included), skipping invalid ones', () => {
    expect([...index.byKey.keys()].sort()).toEqual(['ac dc', 'juliette armanet'])
    expect(index.byKey.get('ac dc')).toHaveLength(2)
    expect(index.maxWords).toBe(2)
  })

  it('finds followed artists as whole words in a title', () => {
    expect(keysInTitle('AC/DC + Juliette Armanet au Stade de France', index).sort()).toEqual(['ac dc', 'juliette armanet'])
    expect(keysInTitle('Tribute ACDC', index)).toEqual([])
  })

  it('announces a new date only to members who followed before it was added', () => {
    const e = ev('a')
    expect(newDateItems('ac dc', e, '2026-10-05T00:00:00Z', index).map((x) => x.userId)).toEqual(['u1'])
    expect(newDateItems('ac dc', e, '2026-10-11T00:00:00Z', index).map((x) => x.userId)).toEqual(['u1', 'u2'])
    expect(onSaleItems('ac dc', e, index).map((x) => x.item.kind)).toEqual(['on_sale', 'on_sale'])
  })

  it('masks e-mails in dry runs', () => {
    expect(maskEmail('johan@example.com')).toBe('jo***@example.com')
    expect(maskEmail('nope')).toBe('***')
  })
})

describe('spotify', () => {
  it('builds the authorize URL', () => {
    const u = new URL(spotifyAuthorizeUrl('cid', 'st', 'https://www.panameclub.fr/api/spotify/callback'))
    expect(u.origin + u.pathname).toBe('https://accounts.spotify.com/authorize')
    expect(u.searchParams.get('scope')).toBe('user-top-read user-follow-read')
    expect(u.searchParams.get('state')).toBe('st')
    expect(u.searchParams.get('redirect_uri')).toBe('https://www.panameclub.fr/api/spotify/callback')
  })

  it('reads artist names from both endpoints', () => {
    expect(spotifyArtistNames({ items: [{ name: 'Daft Punk' }, { name: '' }, {}] })).toEqual(['Daft Punk'])
    expect(spotifyArtistNames({ artists: { items: [{ name: ' Air ' }] } })).toEqual(['Air'])
    expect(spotifyArtistNames(null)).toEqual([])
  })
})
