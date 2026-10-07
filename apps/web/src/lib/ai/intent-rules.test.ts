import { describe, expect, it } from 'vitest'
import { isWellUnderstood, parseIntentRules } from './intent-rules'

describe('parseIntentRules', () => {
  it('understands the brief example', () => {
    const i = parseIntentRules('Je cherche quelque chose ce soir dans le 11e pour deux personnes, moins de 30 €, plutôt musique ou spectacle.')
    expect(i.when).toBe('tonight')
    expect(i.arrondissements).toEqual(['11e'])
    expect(i.people).toBe(2)
    expect(i.maxPrice).toBe(30)
    expect(i.categories).toEqual(expect.arrayContaining(['concerts', 'spectacles']))
  })

  it('free + weekend + family', () => {
    const i = parseIntentRules('sortie gratuite ce week-end avec les enfants')
    expect(i).toMatchObject({ when: 'weekend', free: true })
    expect(i.intents).toContain('en-famille')
  })

  it('does not read prices, ages or hours as arrondissements', () => {
    expect(parseIntentRules('concert à 20h moins de 15 €').arrondissements).toEqual([])
    expect(parseIntentRules('atelier pour enfants de 6 ans').arrondissements).toEqual([])
    expect(parseIntentRules('expo dans le 3e ou le 4e').arrondissements).toEqual(['3e', '4e'])
    expect(parseIntentRules('jazz 75018').arrondissements).toEqual(['18e'])
  })

  it('near me, now, original', () => {
    const i = parseIntentRules('un truc original maintenant près de moi')
    expect(i).toMatchObject({ when: 'now', nearMe: true })
    expect(i.intents).toContain('insolite')
  })

  it('keeps genre keywords', () => {
    expect(parseIntentRules('jazz ce soir').keywords).toEqual(['jazz'])
  })

  it('isWellUnderstood decides when the LLM is useful', () => {
    expect(isWellUnderstood('jazz ce soir', parseIntentRules('jazz ce soir'))).toBe(true)
    const vague = 'un endroit où emmener ma grand-mère qui adore les vieux films en noir et blanc'
    expect(isWellUnderstood(vague, parseIntentRules(vague))).toBe(false)
  })
})
