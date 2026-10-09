import { describe, expect, it } from 'vitest'
import {
  followableFromTitle,
  followKey,
  groupNewMatches,
  isValidTerm,
  lastDates,
  likePattern,
  normalizeTerm,
  pendingNotifications,
  type Follow,
  type FollowMatch,
} from './follows'
import type { CardEvent } from './events/types'

function card(id: string, startDate: string, title = `Event ${id}`): CardEvent {
  return {
    id,
    slug: id,
    title,
    shortDesc: null,
    imageUrl: null,
    startDate,
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
}

const match = (id: string, addedAt: string, start = '2026-12-01T20:00:00Z'): FollowMatch => ({ event: card(id, start), addedAt })

function follow(id: string, over: Partial<Follow> = {}): Follow {
  return {
    id,
    kind: 'artist',
    venueId: null,
    term: id,
    label: id,
    createdAt: '2026-10-01T00:00:00Z',
    lastSeenAt: '2026-10-05T00:00:00Z',
    lastNotifiedAt: null,
    ...over,
  }
}

describe('normalizeTerm', () => {
  it('folds like the SQL search expression and trims punctuation', () => {
    expect(normalizeTerm('  Feu! Chatterton ')).toBe('feu! chatterton')
    expect(normalizeTerm('Cyrano de Bergerac')).toBe('cyrano de bergerac')
    expect(normalizeTerm('« Élise   à  l’Opéra »')).toBe('elise a l’opera')
  })
  it('keeps œ as in the SQL fold (translate does not expand it)', () => {
    expect(normalizeTerm('Œdipe')).toBe('œdipe')
  })
})

describe('isValidTerm', () => {
  it('needs 3 letters or digits and at most 80 characters', () => {
    expect(isValidTerm('ab')).toBe(false)
    expect(isValidTerm('a.b')).toBe(false)
    expect(isValidTerm('m83')).toBe(true)
    expect(isValidTerm('x'.repeat(81))).toBe(false)
  })
})

describe('followableFromTitle', () => {
  it('drops bracketed notes and what follows a pipe', () => {
    expect(followableFromTitle('Cyrano (complet) | Théâtre Edouard VII')).toEqual({ term: 'cyrano', label: 'Cyrano' })
    expect(followableFromTitle('Feu! Chatterton [Tournée]')).toEqual({ term: 'feu! chatterton', label: 'Feu! Chatterton' })
  })
  it('cuts long titles on a word, at most 80 characters', () => {
    const r = followableFromTitle('Un titre vraiment très long '.repeat(6))!
    expect(r.label.length).toBeLessThanOrEqual(80)
    expect(r.label.endsWith(' ')).toBe(false)
  })
  it('returns null when nothing meaningful is left', () => {
    expect(followableFromTitle('(?)')).toBeNull()
    expect(followableFromTitle('DJ')).toBeNull()
  })
})

describe('likePattern', () => {
  it('escapes wildcards and matches both apostrophes', () => {
    expect(likePattern('100%_sur')).toBe('%100\\%\\_sur%')
    expect(likePattern("l'invitation")).toBe('%l_invitation%')
    expect(likePattern('l’invitation')).toBe('%l_invitation%')
  })
})

describe('followKey', () => {
  it('differs by kind and target', () => {
    expect(followKey({ kind: 'venue', venueId: 'v1', term: null })).toBe('venue:v1')
    expect(followKey({ kind: 'artist', venueId: null, term: 'cyrano' })).toBe('artist:cyrano')
  })
})

describe('groupNewMatches', () => {
  it('keeps only events added since last seen, newest first, and drops empty groups', () => {
    const a = follow('a')
    const b = follow('b')
    const byKey = new Map([
      [followKey(a), [match('1', '2026-10-04T00:00:00Z'), match('2', '2026-10-06T00:00:00Z'), match('3', '2026-10-07T00:00:00Z')]],
      [followKey(b), [match('4', '2026-10-01T00:00:00Z')]],
    ])
    const groups = groupNewMatches([a, b], byKey)
    expect(groups).toHaveLength(1)
    expect(groups[0].follow.id).toBe('a')
    expect(groups[0].matches.map((m) => m.event.id)).toEqual(['3', '2'])
  })

  it('caps the total, round-robin across follows, each event once', () => {
    const a = follow('a')
    const b = follow('b')
    const many = (p: string) => Array.from({ length: 10 }, (_, i) => match(`${p}${i}`, `2026-10-0${6 + (i % 3)}T00:00:00Z`))
    const shared = match('shared', '2026-10-09T00:00:00Z')
    const byKey = new Map([
      [followKey(a), [shared, ...many('a')]],
      [followKey(b), [shared, ...many('b')]],
    ])
    const groups = groupNewMatches([a, b], byKey, 5)
    const all = groups.flatMap((g) => g.matches.map((m) => m.event.id))
    expect(all).toHaveLength(5)
    expect(new Set(all).size).toBe(5)
    expect(groups.map((g) => g.follow.id)).toEqual(['a', 'b'])
    expect(groups[0].matches[0].event.id).toBe('shared')
  })
})

describe('lastDates', () => {
  it('lists followed events starting within 7 days, soonest first, deduplicated', () => {
    const now = new Date('2026-10-09T10:00:00Z')
    const a = follow('a')
    const v = follow('v', { kind: 'venue', venueId: 'v', term: null })
    const byKey = new Map([
      [followKey(a), [match('soon', '2026-01-01T00:00:00Z', '2026-10-12T20:00:00Z'), match('later', '2026-01-01T00:00:00Z', '2026-10-30T20:00:00Z')]],
      [followKey(v), [match('soon', '2026-01-01T00:00:00Z', '2026-10-12T20:00:00Z'), match('tonight', '2026-01-01T00:00:00Z', '2026-10-09T19:00:00Z')]],
    ])
    const out = lastDates([a, v], byKey, now)
    expect(out.map((d) => d.event.id)).toEqual(['tonight', 'soon'])
    expect(out[1].follow.id).toBe('a')
  })
})

describe('pendingNotifications', () => {
  it('announces events added since the last notification, never already seen ones', () => {
    const f = follow('a', { createdAt: '2026-10-01T00:00:00Z', lastSeenAt: '2026-10-03T00:00:00Z', lastNotifiedAt: '2026-10-05T00:00:00Z' })
    const list = [match('old', '2026-10-02T00:00:00Z'), match('seen', '2026-10-04T00:00:00Z'), match('new', '2026-10-06T00:00:00Z')]
    expect(pendingNotifications(f, list).map((m) => m.event.id)).toEqual(['new'])
  })
  it('starts from the follow creation when never notified', () => {
    const f = follow('a', { createdAt: '2026-10-01T00:00:00Z', lastSeenAt: '2026-10-01T00:00:00Z' })
    expect(pendingNotifications(f, [match('x', '2026-09-30T00:00:00Z'), match('y', '2026-10-02T00:00:00Z')]).map((m) => m.event.id)).toEqual(['y'])
  })
})
