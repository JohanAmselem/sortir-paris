import { describe, expect, it } from 'vitest'
import { CHALLENGES, challengeForWeek, challengeProgress, unvisitedTopVenues, type Interest } from './challenges'

const bySlug = (slug: string) => CHALLENGES.find((c) => c.slug === slug)!
const week = new Date('2026-10-05T00:00:00+02:00')

function i(over: Partial<Interest>): Interest {
  return { kind: 'save', at: '2026-10-06T10:00:00Z', venueSlug: null, arrondissement: null, categoryId: null, free: false, ...over }
}

describe('challengeForWeek', () => {
  it('is deterministic and changes from week to week', () => {
    expect(challengeForWeek('2026-10-05')).toBe(challengeForWeek('2026-10-05'))
    const seen = new Set(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'].map((w) => challengeForWeek(w).slug))
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('challengeProgress', () => {
  it('lieu phare: a top venue never saved before the week', () => {
    const c = bySlug('lieu-phare')
    const interests = [
      i({ venueSlug: 'olympia', at: '2026-09-01T10:00:00Z' }),
      i({ venueSlug: 'olympia' }),
      i({ venueSlug: 'petit-bain' }),
    ]
    expect(challengeProgress(c, interests, week, ['olympia', 'zenith'])).toEqual({ value: 0, goal: 1, done: false })
    expect(challengeProgress(c, [...interests, i({ venueSlug: 'zenith' })], week, ['olympia', 'zenith'])).toEqual({ value: 1, goal: 1, done: true })
  })

  it('gratuit: a free event in an arrondissement new for the member', () => {
    const c = bySlug('gratuit-arrondissement')
    const before = i({ arrondissement: '11e', at: '2026-09-01T10:00:00Z' })
    expect(challengeProgress(c, [before, i({ arrondissement: '11e', free: true })], week).value).toBe(0)
    expect(challengeProgress(c, [before, i({ arrondissement: '11e' }), i({ arrondissement: '20e' })], week).value).toBe(0)
    expect(challengeProgress(c, [before, i({ arrondissement: '20e', free: true })], week).done).toBe(true)
  })

  it('trois catégories: distinct categories this week, capped at the goal', () => {
    const c = bySlug('trois-categories')
    const list = ['a', 'b', 'b', 'c', 'd'].map((categoryId) => i({ categoryId }))
    expect(challengeProgress(c, list.slice(0, 3), week).value).toBe(2)
    expect(challengeProgress(c, list, week)).toEqual({ value: 3, goal: 3, done: true })
  })

  it('deux sorties: only « j’y vais » of this week count', () => {
    const c = bySlug('deux-sorties')
    const list = [i({ kind: 'attend', at: '2026-09-30T10:00:00Z' }), i({ kind: 'attend' }), i({ kind: 'save' })]
    expect(challengeProgress(c, list, week).value).toBe(1)
  })

  it('no activity means zero, never invented progress', () => {
    for (const c of CHALLENGES) expect(challengeProgress(c, [], week, ['x']).value).toBe(0)
  })
})

describe('unvisitedTopVenues', () => {
  it('skips venues the member already saved something at', () => {
    const top = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }, { slug: 'd' }]
    expect(unvisitedTopVenues(top, [i({ venueSlug: 'b' })], 2).map((v) => v.slug)).toEqual(['a', 'c'])
  })
})
