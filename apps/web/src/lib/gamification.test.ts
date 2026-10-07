import { describe, expect, it } from 'vitest'
import {
  BADGES,
  computeBadges,
  computeGamification,
  computeXp,
  EMPTY_STATS,
  getLevelForXp,
  getXpProgress,
  LEVELS,
  parseBadges,
  XP_REWARDS,
  type MemberStats,
} from './gamification'

const stats = (s: Partial<MemberStats>): MemberStats => ({ ...EMPTY_STATS, ...s })

describe('XP', () => {
  it('is zero for a new member', () => {
    expect(computeXp(EMPTY_STATS)).toBe(0)
  })

  it('is derived from state, so save → unsave → save cannot be farmed', () => {
    const saved = computeXp(stats({ saves: 1 }))
    const unsaved = computeXp(stats({ saves: 0 }))
    expect(saved).toBe(XP_REWARDS.SAVE)
    expect(unsaved).toBe(0)
    // saving the same event again is still one save
    expect(computeXp(stats({ saves: 1 }))).toBe(saved)
  })

  it('adds the first review bonus once and comments only for reviews', () => {
    expect(computeXp(stats({ reviews: 1 }))).toBe(XP_REWARDS.REVIEW + XP_REWARDS.FIRST_REVIEW)
    expect(computeXp(stats({ reviews: 2, comments: 1 }))).toBe(
      2 * XP_REWARDS.REVIEW + XP_REWARDS.FIRST_REVIEW + XP_REWARDS.COMMENT
    )
    // comments can never exceed reviews
    expect(computeXp(stats({ reviews: 1, comments: 5 }))).toBe(
      XP_REWARDS.REVIEW + XP_REWARDS.FIRST_REVIEW + XP_REWARDS.COMMENT
    )
  })

  it('ignores negative or invalid counters', () => {
    expect(computeXp(stats({ saves: -3, swipes: Number.NaN }))).toBe(0)
  })

  it('counts the quiz once', () => {
    expect(computeXp(stats({ quizDone: true }))).toBe(XP_REWARDS.QUIZ)
  })
})

describe('levels', () => {
  it('maps thresholds consistently', () => {
    expect(getLevelForXp(0).level).toBe(1)
    expect(getLevelForXp(99).level).toBe(1)
    expect(getLevelForXp(100).level).toBe(2)
    expect(getLevelForXp(1500).level).toBe(LEVELS.length)
  })

  it('reports progress to the next level', () => {
    const p = getXpProgress(150)
    expect(p.current.level).toBe(2)
    expect(p.next?.level).toBe(3)
    expect(p.xpInLevel).toBe(50)
    expect(p.xpNeeded).toBe(200)
    expect(p.progress).toBe(25)
    expect(getXpProgress(5000).progress).toBe(100)
    expect(getXpProgress(5000).next).toBeNull()
  })

  it('computeGamification level matches its xp', () => {
    const g = computeGamification(stats({ saves: 10, attendances: 3, swipes: 20 }))
    expect(g.xp).toBe(10 * 5 + 3 * 30 + 20 * 2)
    expect(g.level).toBe(getLevelForXp(g.xp).level)
  })
})

describe('badges', () => {
  it('awards nothing to a new member', () => {
    expect(computeBadges(EMPTY_STATS)).toEqual([])
  })

  it('awards first save, outings, explorer and curious badges', () => {
    const b = computeBadges(stats({ saves: 1, attendances: 5, arrondissements: 5, categories: 5 }))
    expect(b).toEqual(expect.arrayContaining(['first-save', 'first-attend', 'five-outings', 'explorer-paris', 'curieux']))
    expect(b).not.toContain('five-reviews')
  })

  it('every badge is reachable', () => {
    const max = stats({
      saves: 999,
      attendances: 999,
      reviews: 999,
      comments: 999,
      swipes: 999,
      quizDone: true,
      arrondissements: 20,
      categories: 10,
      freeEvents: 999,
    })
    expect(computeBadges(max)).toHaveLength(BADGES.length)
  })

  it('parses stored badges and drops unknown slugs', () => {
    expect(parseBadges('first-save, nope ,curieux,')).toEqual(['first-save', 'curieux'])
    expect(parseBadges(null)).toEqual([])
  })
})
