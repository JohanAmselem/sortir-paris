import { describe, expect, it } from 'vitest'
import { looksCancelled } from './format'
import { formatFilmTimes, formatWhen } from './paris-time'
import { isOptimizedImage } from './image-hosts'
import { parseIntentRules } from './ai/intent-rules'
import { intentToQuery } from './ai/recommend-query'

// Friday 9 Oct 2026, 15:00 Paris = 13:00Z
const FRI = new Date('2026-10-09T13:00:00Z')

describe('looksCancelled', () => {
  it('spots cancellations written in the text', () => {
    expect(looksCancelled('ANNULÉ – Concert de Machin')).toBe(true)
    expect(looksCancelled('Concert', 'Annulé en raison des intempéries')).toBe(true)
    expect(looksCancelled('Concert de jazz', 'Un concert à ne pas manquer')).toBe(false)
  })
})

describe('formatWhen for opening hours', () => {
  it('says until when an exhibition day is open instead of "depuis 9h"', () => {
    const e = { startDate: '2026-10-09T07:00:00Z', endDate: '2026-10-09T17:00:00Z' }
    expect(formatWhen(e, FRI)).toBe("Aujourd'hui · jusqu'à 19h")
  })
  it('keeps "En ce moment" for a show that started', () => {
    const e = { startDate: '2026-10-09T12:30:00Z', endDate: '2026-10-09T14:00:00Z' }
    expect(formatWhen(e, FRI)).toBe('En ce moment · depuis 14h30')
  })
})

describe('formatFilmTimes', () => {
  it('lists the next times of the first day', () => {
    const times = ['2026-10-09T16:00:00Z', '2026-10-09T18:30:00Z', '2026-10-09T20:15:00Z', '2026-10-10T16:00:00Z']
    expect(formatFilmTimes(times, FRI)).toBe('Ce soir · 18h, 20h30, 22h15')
  })
  it('falls back to the first séance only', () => {
    expect(formatFilmTimes(['2026-10-10T16:00:00Z'], FRI)).toBe('Demain · 18h')
    expect(formatFilmTimes([], FRI)).toBe('')
  })
})

describe('isOptimizedImage', () => {
  it('routes hotlink-protected hosts through the optimiser', () => {
    expect(isOptimizedImage('https://www.billetreduc.com/zg/n100/123.jpeg')).toBe(true)
    expect(isOptimizedImage('https://cdn.sortiraparis.com/images/1.jpg')).toBe(true)
    expect(isOptimizedImage('https://images.unsplash.com/photo-1')).toBe(true)
    expect(isOptimizedImage('https://fr.web.img6.acsta.net/a.jpg')).toBe(true)
    expect(isOptimizedImage('https://evil.example.com/a.jpg')).toBe(false)
    expect(isOptimizedImage('http://www.billetreduc.com/a.jpg')).toBe(false)
    expect(isOptimizedImage('not a url')).toBe(false)
  })
})

describe('intent rules', () => {
  it('reads "stand up ce soir" as humour tonight', () => {
    const i = parseIntentRules('un stand up ce soir')
    expect(i.when).toBe('tonight')
    expect(i.categories).toContain('spectacles')
    const q = intentToQuery(i)
    expect(q.topics).toEqual(['humour'])
    expect(q.q).toBeNull()
  })
  it('reads "pour les enfants" as en famille', () => {
    expect(parseIntentRules('un spectacle pour les enfants dimanche').intents).toContain('en-famille')
  })
})
