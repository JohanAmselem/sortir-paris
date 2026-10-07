import { describe, expect, it } from 'vitest'
import { buildEventParams, countFilters, parseEventParams } from './params'

describe('event url params', () => {
  it('round-trips', () => {
    const q = parseEventParams({ when: 'tonight', cat: 'concerts,theatre', arr: '11,3e', free: '1', mood: 'entre-amis', q: 'jazz' })
    expect(q).toMatchObject({
      when: 'tonight',
      categories: ['concerts', 'theatre'],
      arrondissements: ['11e', '3e'],
      free: true,
      intents: ['entre-amis'],
      q: 'jazz',
    })
    expect(parseEventParams(buildEventParams(q))).toMatchObject(q)
    expect(countFilters(q)).toBe(7)
  })

  it('accepts legacy params and drops unknown values', () => {
    const q = parseEventParams({ date: 'weekend', category: 'expos', ambiance: 'romantique', arr: '25e' })
    expect(q.when).toBe('weekend')
    expect(q.categories).toEqual(['expos'])
    expect(q.intents).toEqual([])
    expect(q.arrondissements).toEqual([])
  })

  it('ignores coordinates outside Paris', () => {
    expect(parseEventParams({ lat: '40.7', lng: '-74' }).near).toBeNull()
    expect(parseEventParams({ lat: '48.86', lng: '2.35' }).near).toMatchObject({ lat: 48.86, lng: 2.35 })
  })
})
