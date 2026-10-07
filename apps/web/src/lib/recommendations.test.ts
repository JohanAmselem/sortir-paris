import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@sortir/db', () => ({ db: {} }))
vi.mock('@/lib/events/query', () => ({ safeQueryEvents: vi.fn(), diversify: (l: unknown[]) => l }))

import { buildPersonalPlan, clientSignalsSchema, explainPick, mergeSignals, rankCandidates } from './recommendations'
import type { CardEvent } from './events/types'

const ev = (id: string, cat: string, extra: Partial<CardEvent> = {}): CardEvent => ({
  id,
  slug: id,
  title: id,
  shortDesc: null,
  imageUrl: 'x',
  startDate: '2026-10-10T18:00:00Z',
  endDate: null,
  timeKnown: true,
  priceMin: 1500,
  priceMax: 1500,
  priceStatus: 'paid',
  isFree: false,
  saveCount: 0,
  qualityScore: 0,
  category: { slug: cat, name: cat, icon: null },
  venue: { name: 'v', slug: `v-${id}`, arrondissement: '11e', lat: null, lng: null },
  ...extra,
})

describe('buildPersonalPlan', () => {
  it('is not personalised without signals', () => {
    const plan = buildPersonalPlan({}, { when: 'week' })
    expect(plan.personalized).toBe(false)
    expect(plan.query).toEqual({ when: 'week' })
  })

  it('ranks explicit preferences, likes and archetype affinities', () => {
    const plan = buildPersonalPlan({
      categories: ['theatre'],
      liked: { concerts: 4 },
      archetype: 'flaneur-curieux', // expos, visites, festivals
    })
    expect(plan.personalized).toBe(true)
    expect(plan.categories).toHaveLength(3)
    expect(plan.categories.slice(0, 2)).toEqual(['concerts', 'theatre'])
    expect(plan.query.categories).toEqual(plan.categories)
    expect(plan.intents).toContain('plein-air')
  })

  it('drops unknown slugs and disliked categories', () => {
    const plan = buildPersonalPlan({ categories: ['nope', 'expos'], liked: { cinema: 1 }, disliked: { cinema: 5 } })
    expect(plan.categories).toEqual(['expos'])
  })

  it('maps budget: free preference and low budget score', () => {
    expect(buildPersonalPlan({ prefFree: true }).query.maxPrice).toBe(0)
    expect(buildPersonalPlan({ scores: { budget: 10 } }).query.maxPrice).toBe(20)
    expect(buildPersonalPlan({ scores: { budget: 80 } }).query.maxPrice).toBeUndefined()
  })

  it('derives intents from scores and normalises arrondissements', () => {
    const plan = buildPersonalPlan({ scores: { energy: 90, depth: 80 }, arrondissements: ['11', '75003', 'xx'] })
    expect(plan.intents).toEqual(expect.arrayContaining(['festif', 'culture-pointue']))
    expect(plan.arrondissements).toEqual(['11e', '3e'])
  })

  it('carries exclusions in the query', () => {
    const plan = buildPersonalPlan({ excludeIds: ['a', 'a', 'b'] })
    expect(plan.query.excludeIds).toEqual(['a', 'b'])
  })
})

describe('mergeSignals', () => {
  it('server preferences win, counts add up, exclusions merge', () => {
    const m = mergeSignals(
      { categories: ['expos'], liked: { concerts: 1 }, excludeIds: ['1'] },
      { categories: ['theatre'], liked: { concerts: 2, danse: 1 }, archetype: 'fetard-culturel', excludeIds: ['1', '2'] }
    )
    expect(m.categories).toEqual(['expos'])
    expect(m.liked).toEqual({ concerts: 3, danse: 1 })
    expect(m.archetype).toBe('fetard-culturel')
    expect(m.excludeIds).toEqual(['1', '2'])
  })
})

describe('explainPick', () => {
  const plan = buildPersonalPlan({ categories: ['concerts'], arrondissements: ['11e'], scores: { energy: 90 } })

  it('explains by intent, category, zone', () => {
    expect(explainPick(ev('1', 'concerts'), plan, { intentIds: new Set(['1']) })).toMatch(/ton style$/)
    expect(explainPick(ev('1', 'concerts'), plan)).toBe('Parce que tu aimes concerts')
    expect(explainPick(ev('2', 'expos'), plan)).toBe('Dans ton coin (11e)')
  })

  it('falls back to popularity / generic reasons', () => {
    const generic = buildPersonalPlan({})
    expect(explainPick(ev('3', 'expos', { saveCount: 4 }), generic)).toBe('Gardé par 4 membres')
    expect(explainPick(ev('3', 'expos', { priceStatus: 'free' }), generic)).toBe('Gratuit cette semaine')
    expect(explainPick(ev('3', 'expos'), generic)).toBe('Une valeur sûre de la semaine')
  })
})

describe('rankCandidates', () => {
  it('boosts preferred categories and events found by several lists, drops exclusions', () => {
    const plan = buildPersonalPlan({ categories: ['concerts'], excludeIds: ['x'] })
    // Preferred category beats a slightly better-ranked other one.
    const one = rankCandidates([[ev('a', 'expos'), ev('x', 'concerts'), ev('b', 'concerts')]], plan)
    expect(one.map((e) => e.id)).toEqual(['b', 'a'])
    // Found by two lists beats found by one.
    const two = rankCandidates([[ev('c', 'expos'), ev('d', 'expos')], [ev('d', 'expos')]], plan)
    expect(two[0].id).toBe('d')
  })
})

describe('clientSignalsSchema', () => {
  it('accepts valid local signals and rejects junk', () => {
    expect(clientSignalsSchema.safeParse({ archetype: 'fetard-culturel', scores: { energy: 80 } }).success).toBe(true)
    expect(clientSignalsSchema.safeParse({ archetype: 'admin' }).success).toBe(false)
    expect(clientSignalsSchema.safeParse({ scores: { energy: 300 } }).success).toBe(false)
    expect(clientSignalsSchema.safeParse({ excludeIds: ['not-a-uuid'] }).success).toBe(false)
    expect(clientSignalsSchema.safeParse({ evil: 1 }).success).toBe(false)
  })
})
