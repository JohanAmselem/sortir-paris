import { describe, expect, it } from 'vitest'
import { monthWithYear, sitemapMonthPaths, validMonth } from './agenda-pages'
import { suggestionItems } from './search-suggestions'
import { cardPrice } from './format'

// Lundi 23 novembre 2026, 15 h à Paris.
const NOW = new Date('2026-11-23T14:00:00Z')

describe('pages mois', () => {
  it('accepte le mois en cours et les 24 suivants, pas le passé', () => {
    expect(validMonth('2026-11', NOW)).toBe(true)
    expect(validMonth('2027-03', NOW)).toBe(true)
    expect(validMonth('2026-10', NOW)).toBe(false)
    expect(validMonth('2029-03', NOW)).toBe(false)
    expect(validMonth('2027-13', NOW)).toBe(false)
    expect(validMonth('mars', NOW)).toBe(false)
  })
  it('écrit toujours l’année', () => {
    expect(monthWithYear('2027-03')).toBe('mars 2027')
    expect(monthWithYear('2026-12')).toBe('décembre 2026')
  })
  it('liste 12 mois, seuls et croisés avec 6 catégories', () => {
    const paths = sitemapMonthPaths(NOW)
    expect(paths).toHaveLength(12 * 7)
    expect(paths[0]).toBe('/agenda/2026-11')
    expect(paths).toContain('/agenda/2027-03/concerts')
    expect(paths.at(-1)).toBe('/agenda/2027-10/festivals')
  })
})

describe('suggestions de la recherche', () => {
  it('artistes d’abord, vers l’Agenda', () => {
    const items = suggestionItems([{ key: 'angele', name: 'Angèle', dates: 4 }], {
      venues: [{ name: 'L’Olympia', slug: 'l-olympia', area: '9e' }],
      categories: [{ label: 'Concerts', href: '/categories/concerts' }],
      events: [{ title: 'Angèle', href: '/evenements/angele-2027-03-08', venue: 'Accor Arena' }],
    })
    expect(items.map((i) => i.kind)).toEqual(['artist', 'venue', 'category', 'event'])
    expect(items[0]).toMatchObject({ href: '/agenda?q=Ang%C3%A8le', detail: '4 dates' })
  })
})

describe('prix des cartes', () => {
  it('prix exact entier sans centimes', () => {
    expect(cardPrice({ priceMin: 3900, priceMax: 3900, priceStatus: 'paid' }).label).toBe('39\u00a0€')
  })
})
