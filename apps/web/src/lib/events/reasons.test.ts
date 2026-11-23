import { describe, expect, it } from 'vitest'
import { pickReason } from './reasons'
import type { CardEvent } from './types'

const NOW = new Date('2026-11-23T17:00:00Z') // lundi 18 h à Paris
const base: CardEvent = {
  id: '1',
  slug: 's',
  title: 'T',
  shortDesc: null,
  imageUrl: null,
  startDate: '2026-11-23T20:00:00Z',
  endDate: null,
  timeKnown: true,
  priceMin: 0,
  priceMax: 0,
  priceStatus: 'unknown',
  isFree: false,
  saveCount: 0,
  qualityScore: 0,
  category: null,
  venue: null,
}

describe('pickReason : des faits, jamais une promesse', () => {
  it('près, bientôt, dernier jour, gratuit, petit prix, nouveau', () => {
    expect(pickReason({ ...base, distanceKm: 0.8 }, NOW)).toBe('Près de toi')
    expect(pickReason({ ...base, startDate: '2026-11-23T17:40:00Z' }, NOW)).toBe('Dans 40 min')
    expect(pickReason({ ...base, startDate: '2026-10-01T08:00:00Z', endDate: '2026-11-23T22:00:00Z' }, NOW)).toBe('Dernier jour')
    expect(pickReason({ ...base, priceStatus: 'free' }, NOW)).toBe('Gratuit')
    expect(pickReason({ ...base, priceStatus: 'paid', priceMin: 1200, priceMax: 1200 }, NOW)).toBe('Moins de 15 €')
    expect(pickReason({ ...base, priceStatus: 'paid', priceMin: 3250, priceMax: 3250 }, NOW)).toBeNull()
    expect(pickReason({ ...base, priceStatus: 'paid', priceMin: 2500, priceMax: 2500 }, NOW)).toBeNull()
    expect(pickReason({ ...base, priceStatus: 'paid', priceMin: 2490, priceMax: 2490 }, NOW)).toBe('Moins de 25 €')
    expect(pickReason({ ...base, isNew: true }, NOW)).toBe('Nouveau')
  })
})
