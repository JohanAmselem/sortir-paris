import { describe, expect, it } from 'vitest'
import { containsBlockedWords, normalizeForModeration } from './review-moderation'

describe('containsBlockedWords', () => {
  it('laisse passer les avis normaux, même sévères', () => {
    for (const ok of [
      'Super concert, le son était parfait !',
      'Spectacle commencé en retard, mais génial.',
      'Un baiser sous la tour Eiffel, très romantique',
      'Pièce sur le régime nazi, bouleversante.',
      'Le pianiste joue de la pédale avec finesse',
      'Bof, un peu long et décevant.',
      'Une expo unique, à voir absolument',
      'Grab a bite after the show, great vibe',
      'Moby Dick au théâtre, magnifique',
      '',
    ]) expect(containsBlockedWords(ok), ok).toBe(false)
  })

  it('bloque les insultes, y compris déguisées', () => {
    for (const ko of ['Quel connard ce videur', 'bande de SALOPES', 'c3 m3c 3st un c0nnard', 'fdp', 'Ferme ta gueule', 'f i l s d e p u t e', 'what a fucking mess', 'pute']) {
      expect(containsBlockedWords(ko), ko).toBe(true)
    }
  })

  it('ne confond pas les mots isolés avec des morceaux de mots', () => {
    expect(containsBlockedWords('Le spectacle était rempli de tg')).toBe(true)
    expect(containsBlockedWords('Une tgv vers Lyon')).toBe(false)
    expect(containsBlockedWords('Députés et journalistes')).toBe(false)
  })
})

describe('normalizeForModeration', () => {
  it('retire accents et chiffres déguisés', () => {
    expect(normalizeForModeration('Énooorme b4t4rd')).toBe('enorme batard')
  })
})
