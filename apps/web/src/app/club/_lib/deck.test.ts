import { describe, expect, it } from 'vitest'
import { countCategories, interleaveByCategory } from './deck'
import { safeNext } from './safe-next'
import type { CardEvent } from '@/lib/events/types'

const ev = (id: string, cat: string | null): CardEvent => ({
  id,
  slug: id,
  title: id,
  shortDesc: null,
  imageUrl: 'x',
  startDate: '2026-10-10T18:00:00Z',
  endDate: null,
  timeKnown: true,
  priceMin: 0,
  priceMax: 0,
  priceStatus: 'unknown',
  isFree: false,
  saveCount: 0,
  qualityScore: 0,
  category: cat ? { slug: cat, name: cat, icon: null } : null,
  venue: null,
})

describe('interleaveByCategory', () => {
  it('alternates categories and keeps order inside each one', () => {
    const out = interleaveByCategory([ev('1', 'a'), ev('2', 'a'), ev('3', 'a'), ev('4', 'b'), ev('5', 'c')])
    expect(out.map((e) => e.id)).toEqual(['1', '4', '5', '2', '3'])
  })

  it('drops excluded ids and duplicates, respects max', () => {
    const out = interleaveByCategory([ev('1', 'a'), ev('1', 'a'), ev('2', null), ev('3', 'b')], ['3'], 5)
    expect(out.map((e) => e.id)).toEqual(['1', '2'])
    expect(interleaveByCategory([ev('1', 'a'), ev('2', 'b'), ev('3', 'c')], [], 2)).toHaveLength(2)
  })
})

describe('countCategories', () => {
  it('splits likes and dislikes', () => {
    expect(
      countCategories([
        { category: 'concerts', direction: 'right' },
        { category: 'concerts', direction: 'right' },
        { category: 'expos', direction: 'left' },
        { category: null, direction: 'right' },
      ])
    ).toEqual({ liked: { concerts: 2 }, disliked: { expos: 1 } })
  })
})

describe('safeNext', () => {
  it('keeps same-site paths', () => {
    expect(safeNext('/match')).toBe('/match')
    expect(safeNext('/compte/adn?x=1')).toBe('/compte/adn?x=1')
  })
  it('rejects open redirects', () => {
    for (const bad of ['@evil.com', '//evil.com', '/\\evil.com', 'https://evil.com', '/x\\y', '', null, undefined, '/a\nb']) {
      expect(safeNext(bad)).toBe('/')
    }
  })
})
