import { describe, expect, it } from 'vitest'
import { hallTier, spreadOverMonths } from './big-dates'
import type { CardEvent } from './types'

const ev = (id: string, startDate: string, venue: string, isNew = false): CardEvent => ({
  id,
  slug: id,
  title: `Concert ${id}`,
  shortDesc: null,
  imageUrl: 'https://x/y.jpg',
  startDate,
  endDate: null,
  timeKnown: true,
  priceMin: 4000,
  priceMax: 6000,
  priceStatus: 'paid',
  isFree: false,
  saveCount: 0,
  qualityScore: 50,
  category: null,
  venue: { name: venue, slug: venue, arrondissement: null, lat: null, lng: null },
  isNew,
})

describe('grosses dates', () => {
  it('classe les salles : arènes, grandes salles, autres', () => {
    expect(hallTier('Accor Arena')).toBe(3)
    expect(hallTier("L'OLYMPIA")).toBe(3)
    expect(hallTier('Zenith de Paris La Villette')).toBe(3)
    expect(hallTier('La Cigale')).toBe(2)
    expect(hallTier('New Morning')).toBe(1)
  })

  it('va chercher loin : un par mois avant de remplir, triés par date', () => {
    const dec = [ev('a', '2026-12-03T19:00:00Z', 'New Morning'), ev('b', '2026-12-05T19:00:00Z', 'Accor Arena')]
    const jan = [ev('c', '2027-01-09T19:00:00Z', 'La Cigale')]
    const mar = [ev('d', '2027-03-08T19:00:00Z', 'Accor Arena', true), ev('e', '2027-03-01T19:00:00Z', 'Duc des Lombards')]
    const out = spreadOverMonths([dec, jan, mar], 3)
    expect(out.map((e) => e.id)).toEqual(['b', 'c', 'd'])
  })

  it('ne répète pas un même titre', () => {
    const a = ev('a', '2026-12-03T19:00:00Z', 'Accor Arena')
    const b = { ...ev('b', '2027-01-03T19:00:00Z', 'Accor Arena'), title: a.title }
    expect(spreadOverMonths([[a], [b]], 5).map((e) => e.id)).toEqual(['a'])
  })
})
