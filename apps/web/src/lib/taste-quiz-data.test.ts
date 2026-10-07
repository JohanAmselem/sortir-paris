import { describe, expect, it } from 'vitest'
import {
  ARCHETYPES,
  ARCHETYPE_AFFINITIES,
  ARCHETYPE_PROFILES,
  computeScores,
  DIMENSIONS,
  findArchetype,
  QUICK_QUESTION_IDS,
  QUIZ_QUESTIONS,
  scoreQuiz,
  type QuizAnswers,
} from './taste-quiz-data'
import { CATEGORY_BY_SLUG, INTENT_BY_SLUG } from './events/taxonomy'

describe('quiz data', () => {
  it('has unique question ids and known quick ids', () => {
    const ids = QUIZ_QUESTIONS.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of QUICK_QUESTION_IDS) expect(ids).toContain(id)
  })

  it('quick mode covers every dimension', () => {
    const covered = new Set(
      QUIZ_QUESTIONS.filter((q) => QUICK_QUESTION_IDS.includes(q.id)).flatMap((q) => q.dimensions.map((d) => d.dimension))
    )
    for (const d of DIMENSIONS) expect(covered.has(d)).toBe(true)
  })

  it('archetypes have profiles and valid affinities', () => {
    for (const slug of Object.keys(ARCHETYPES)) {
      expect(ARCHETYPE_PROFILES[slug]).toBeDefined()
      for (const c of ARCHETYPE_AFFINITIES[slug].categories) expect(CATEGORY_BY_SLUG[c]).toBeDefined()
      for (const i of ARCHETYPE_AFFINITIES[slug].intents) expect(INTENT_BY_SLUG[i]).toBeDefined()
    }
  })
})

describe('scoring', () => {
  it('is neutral without answers and ignores unknown questions', () => {
    const s = computeScores({ nope: 'a' } as QuizAnswers)
    for (const d of DIMENSIONS) expect(s[d]).toBe(50)
  })

  it("'b' pushes positive-weight dimensions high", () => {
    // q6: tamisé (a) vs stroboscopes (b) → energy
    expect(computeScores({ q6: 'b' }).energy).toBe(100)
    expect(computeScores({ q6: 'a' }).energy).toBe(0)
  })

  it("negative weights: 'a' pushes the dimension high", () => {
    // q11: lieu inconnu (a) → adventurous
    expect(computeScores({ q11: 'a' }).exploration).toBe(100)
    // q40: plus de questions (a) → intellectual
    expect(computeScores({ q40: 'a' }).depth).toBe(100)
    expect(computeScores({ q40: 'b' }).depth).toBe(0)
  })

  it('finds the closest archetype', () => {
    expect(findArchetype(ARCHETYPE_PROFILES['intellectuel-engage'])).toBe('intellectuel-engage')
    expect(findArchetype(ARCHETYPE_PROFILES['fetard-culturel'])).toBe('fetard-culturel')
  })

  it('a party-loving quick quiz gives a festive archetype', () => {
    const answers: QuizAnswers = { q1: 'b', q4: 'b', q12: 'a', q21: 'b', q33: 'b', q11: 'b', q5: 'b', q16: 'b', q25: 'b', q40: 'b' }
    const r = scoreQuiz(answers)
    expect(r.answered).toBe(10)
    expect(r.scores.energy).toBeGreaterThanOrEqual(70)
    expect(['fetard-culturel', 'epicurien-social']).toContain(r.archetype)
    expect(r.summary).toContain(ARCHETYPES[r.archetype].name)
  })

  it('a contemplative, curious quick quiz is not festive', () => {
    const answers: QuizAnswers = { q1: 'a', q4: 'a', q12: 'a', q21: 'a', q33: 'a', q11: 'a', q5: 'a', q16: 'a', q25: 'a', q40: 'a' }
    const r = scoreQuiz(answers)
    expect(r.scores.exploration).toBe(100)
    expect(r.scores.depth).toBe(100)
    expect(['fetard-culturel', 'epicurien-social']).not.toContain(r.archetype)
  })
})
