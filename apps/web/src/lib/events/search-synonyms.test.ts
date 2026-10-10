import { describe, expect, it } from 'vitest'
import { extractSearchFilters } from './search-synonyms'
import { parseEventParams } from './params'
import { filmSlug } from './fold'

describe('extractSearchFilters', () => {
  it('understands stand up in every spelling (multi-word before tokens)', () => {
    for (const q of ['stand up', 'Stand-up', 'standup', 'STAND UP']) {
      expect(extractSearchFilters(q)).toMatchObject({ topics: ['humour'], q: null })
    }
  })

  it('maps kids, free and categories to filters and keeps the rest as text', () => {
    expect(extractSearchFilters('spectacle enfants')).toMatchObject({ categories: ['spectacles'], intents: ['en-famille'], q: null })
    expect(extractSearchFilters('expo gratuite')).toMatchObject({ categories: ['expos'], free: true, q: null })
    expect(extractSearchFilters('concert jazz')).toMatchObject({ categories: ['concerts'], q: 'jazz' })
    expect(extractSearchFilters('ciné')).toMatchObject({ categories: ['cinema'] })
    expect(extractSearchFilters('films')).toMatchObject({ categories: ['cinema'] })
    expect(extractSearchFilters('Théâtre')).toMatchObject({ categories: ['theatre'] })
  })

  it('leaves venue names and plain words alone', () => {
    expect(extractSearchFilters('théâtre de la ville de paris')).toMatchObject({ categories: [], q: 'théâtre de la ville de paris' })
    expect(extractSearchFilters('jazz')).toEqual({ q: 'jazz', categories: ['concerts', 'festivals', 'soirees'], intents: [], topics: [], free: false })
    // "exposition" inside another word is not a match.
    expect(extractSearchFilters('superconcerts').categories).toEqual([])
  })
})

describe('parseEventParams with search words', () => {
  it('turns the words into filters unless the exact text is asked for', () => {
    expect(parseEventParams({ q: 'stand up' })).toMatchObject({ q: null, topics: ['humour'] })
    expect(parseEventParams({ q: 'expos gratuites' })).toMatchObject({ categories: ['expos'], free: true, q: null })
    expect(parseEventParams({ q: 'stand up', raw: '1' })).toMatchObject({ q: 'stand up', topics: [] })
  })

  it('round-trips topics and excluded categories', () => {
    const q = parseEventParams({ topic: 'humour,inconnu', xcat: 'cinema' })
    expect(q.topics).toEqual(['humour'])
    expect(q.excludeCategories).toEqual(['cinema'])
  })
})

describe('filmSlug', () => {
  it('gives the same key to the same film whatever the spelling', () => {
    expect(filmSlug('L’Invitation')).toBe('l-invitation')
    expect(filmSlug("L'invitation")).toBe('l-invitation')
    expect(filmSlug('  Ni vue, ni connue ')).toBe('ni-vue-ni-connue')
    expect(filmSlug('Été 85')).toBe('ete-85')
  })

  it('music genres search among musical outings only, keeping the word as text', () => {
    expect(extractSearchFilters('metal')).toMatchObject({ categories: ['concerts', 'festivals', 'soirees'], q: 'metal' })
    expect(extractSearchFilters('concert metal')).toMatchObject({ categories: ['concerts'], q: 'metal' })
    expect(extractSearchFilters('hard rock')).toMatchObject({ q: 'hard rock' })
  })
})
