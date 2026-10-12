import { describe, expect, it } from 'vitest'
import { eventWindow, planForDate } from './schedule'
import { buildItems, coverItem, creditLine, eligible, inArea, isExcluded, selectEvents, slideWhen, type SelectContext } from './select'
import type { Candidate } from './types'

// Published Wednesday 14 Oct 2026 at 18:00 → events of Thursday 15 Oct.
const at = planForDate('2026-10-14').find((p) => p.theme === 'demain')!.scheduledAt
const tw = eventWindow('demain', at)

let n = 0
function ev(over: Partial<Candidate> = {}): Candidate {
  n++
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    slug: `event-${n}`,
    title: `Concert numéro ${n}`,
    shortDesc: null,
    imageUrl: `https://img.example.org/${n}.jpg`,
    startDate: '2026-10-15T18:00:00.000Z', // 20:00 Paris
    endDate: null,
    timeKnown: true,
    priceMin: 1500,
    priceMax: 1500,
    priceStatus: 'paid',
    isFree: false,
    qualityScore: 90,
    saveCount: 0,
    source: 'openagenda',
    status: 'active',
    categorySlug: 'concerts',
    venueId: `venue-${n}`,
    venueName: `Salle ${n}`,
    venueSlug: `salle-${n}`,
    venueArr: '11e',
    venueZip: '75011',
    venueCity: 'Paris',
    ...over,
  }
}

const ctx = (over: Partial<SelectContext> = {}): SelectContext => ({
  window: 'demain',
  theme: 'demain',
  timeWindow: tw,
  exclusions: [],
  signatureIds: new Set(),
  ...over,
})

describe('eligible', () => {
  it('keeps a well-described event of tomorrow', () => {
    expect(eligible(ev(), ctx())).toBe(true)
  })

  it('needs a known time, a known venue and a high quality score', () => {
    expect(eligible(ev({ timeKnown: false }), ctx())).toBe(false)
    expect(eligible(ev({ venueId: null, venueName: null }), ctx())).toBe(false)
    expect(eligible(ev({ qualityScore: 50 }), ctx())).toBe(false)
  })

  it('drops cancelled events, cinema séances and administrative topics', () => {
    expect(eligible(ev({ status: 'cancelled' }), ctx())).toBe(false)
    expect(eligible(ev({ title: 'ANNULÉ - Concert' }), ctx())).toBe(false)
    expect(eligible(ev({ categorySlug: 'cinema' }), ctx())).toBe(false)
    expect(eligible(ev({ title: 'Permanence juridique en mairie' }), ctx())).toBe(false)
  })

  it('keeps Paris and the petite couronne only', () => {
    expect(inArea({ venueArr: null, venueZip: '93100' })).toBe(true)
    expect(inArea({ venueArr: null, venueZip: '78000' })).toBe(false)
    expect(eligible(ev({ venueArr: null, venueZip: '91000', venueCity: 'Évry' }), ctx())).toBe(false)
  })

  it('drops events outside the window', () => {
    expect(eligible(ev({ startDate: '2026-10-16T18:00:00.000Z' }), ctx())).toBe(false)
  })

  it('keeps long-running exhibitions out of « Demain », except in the Expos story', () => {
    const expo = ev({ categorySlug: 'expos', startDate: '2026-09-01T08:00:00.000Z', endDate: '2027-01-10T18:00:00.000Z', timeKnown: false })
    expect(eligible(expo, ctx())).toBe(false)
    expect(eligible(expo, ctx({ theme: 'expos' }))).toBe(true)
    expect(eligible(expo, ctx({ theme: 'concerts' }))).toBe(false)
  })

  it('applies the theme of a story', () => {
    expect(eligible(ev({ categorySlug: 'theatre' }), ctx({ theme: 'concerts' }))).toBe(false)
    expect(eligible(ev({ categorySlug: 'spectacles' }), ctx({ theme: 'theatre-humour' }))).toBe(true)
    expect(eligible(ev({ priceStatus: 'free' }), ctx({ theme: 'gratuit' }))).toBe(true)
    expect(eligible(ev({ title: 'Contes pour enfants' }), ctx({ theme: 'en-famille' }))).toBe(true)
    // « conte » inside « contemporain » is not a family event.
    expect(eligible(ev({ title: 'Danse contemporaine' }), ctx({ theme: 'en-famille' }))).toBe(false)
  })
})

describe('exclusions', () => {
  it('excludes by venue id or slug, source and event', () => {
    const e = ev({ venueId: 'v1', venueSlug: 'la-cigale', source: 'shotgun' })
    expect(isExcluded(e, [{ kind: 'venue', value: 'la-cigale' }])).toBe(true)
    expect(isExcluded(e, [{ kind: 'venue', value: 'v1' }])).toBe(true)
    expect(isExcluded(e, [{ kind: 'source', value: 'Shotgun' }])).toBe(true)
    expect(isExcluded(e, [{ kind: 'event', value: e.id }])).toBe(true)
    expect(isExcluded(e, [{ kind: 'event', value: e.slug }])).toBe(true)
    expect(isExcluded(e, [{ kind: 'venue', value: 'autre' }])).toBe(false)
    expect(eligible(e, ctx({ exclusions: [{ kind: 'source', value: 'shotgun' }] }))).toBe(false)
  })
})

describe('selectEvents', () => {
  const mixed = () => [
    ...Array.from({ length: 6 }, () => ev({ categorySlug: 'concerts' })),
    ...Array.from({ length: 4 }, () => ev({ categorySlug: 'theatre' })),
    ...Array.from({ length: 4 }, () => ev({ categorySlug: 'expos', startDate: '2026-10-15T08:00:00.000Z', endDate: '2026-10-15T16:00:00.000Z' })),
    ...Array.from({ length: 3 }, () => ev({ categorySlug: 'soirees' })),
  ]

  it('picks 8 events for a carousel, at most 2 per category, never twice the same venue', () => {
    const picked = selectEvents(mixed(), ctx(), 'carousel')
    expect(picked).toHaveLength(8)
    const perCat = new Map<string, number>()
    for (const p of picked) perCat.set(p.categorySlug!, (perCat.get(p.categorySlug!) ?? 0) + 1)
    expect(Math.max(...perCat.values())).toBeLessThanOrEqual(2)
    expect(new Set(picked.map((p) => p.venueId)).size).toBe(8)
  })

  it('relaxes the category mix rather than publishing too few events', () => {
    const picked = selectEvents(Array.from({ length: 10 }, () => ev()), ctx(), 'carousel')
    expect(picked).toHaveLength(8)
  })

  it('one event per venue, even when relaxing', () => {
    const list = Array.from({ length: 10 }, () => ev({ venueId: 'same', venueSlug: 'same' }))
    expect(selectEvents(list, ctx(), 'carousel')).toEqual([])
  })

  it('puts signature venues first', () => {
    const list = Array.from({ length: 9 }, () => ev({ qualityScore: 100 }))
    const star = ev({ qualityScore: 80, venueId: 'philharmonie' })
    const picked = selectEvents([...list, star], ctx({ signatureIds: new Set(['philharmonie']) }), 'carousel')
    expect(picked[0].id).toBe(star.id)
  })

  it('skips a carousel with fewer than 5 good events', () => {
    expect(selectEvents([ev(), ev(), ev(), ev()], ctx(), 'carousel')).toEqual([])
  })

  it('stories need at least 3 events of the theme and keep 5 at most', () => {
    expect(selectEvents([ev(), ev()], ctx({ theme: 'concerts' }), 'story')).toEqual([])
    expect(selectEvents(Array.from({ length: 9 }, () => ev()), ctx({ theme: 'concerts' }), 'story')).toHaveLength(5)
  })

  it('sorts week carousels chronologically', () => {
    const mon = planForDate('2026-10-12')[0].scheduledAt
    const week = eventWindow('semaine', mon)
    const days = ['2026-10-17', '2026-10-13', '2026-10-15', '2026-10-14', '2026-10-16', '2026-10-18']
    const list = days.map((d, i) => ev({ startDate: `${d}T18:00:00.000Z`, categorySlug: ['concerts', 'theatre', 'expos', 'soirees', 'danse', 'spectacles'][i] }))
    const picked = selectEvents(list, ctx({ window: 'semaine', theme: 'semaine', timeWindow: week }), 'carousel')
    expect(picked.map((p) => p.startDate.slice(0, 10))).toEqual([...days].sort())
  })
})

describe('items', () => {
  it('builds cover + events + CTA, 10 images at most, with the photo credit', () => {
    const picked = Array.from({ length: 8 }, () => ev())
    const items = buildItems('carousel', coverItem('Demain à Paris', 'jeudi 15 octobre', 'La sélection'), picked)
    expect(items).toHaveLength(10)
    expect(items[0].type).toBe('cover')
    expect(items[9].type).toBe('cta')
    expect(items[1]).toMatchObject({ type: 'event', subtitle: `${picked[0].venueName} · 11e`, price: '15 €', category: 'Concert' })
    expect(items[1].credit).toBe(creditLine(picked[0]))
    expect(creditLine(picked[0])).toMatch(/^Photo : Salle \d+ \(via OpenAgenda\)$/)
  })

  it('no CTA slide in stories', () => {
    const items = buildItems('story', coverItem('Demain à Paris', 'jeudi 15 octobre', 'Concerts'), [ev(), ev(), ev()])
    expect(items.map((i) => i.type)).toEqual(['cover', 'event', 'event', 'event'])
  })

  it('formats the day and time in Paris', () => {
    expect(slideWhen({ startDate: '2026-10-15T18:30:00.000Z', endDate: null, timeKnown: true })).toBe('Jeu. 15 oct. · 20h30')
    expect(slideWhen({ startDate: '2026-09-01T08:00:00.000Z', endDate: '2027-01-10T18:00:00.000Z', timeKnown: false })).toBe('Jusqu’au 10 janv.')
  })
})
