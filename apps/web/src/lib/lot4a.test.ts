import { describe, expect, it } from 'vitest'
import { bestWorkImage, bestWorkText, bestWorkTitle, groupWorkByVenue, isGenericWorkSlug, workLikePattern, workSlug, type WorkDate } from './events/works-utils'
import { SIGNATURE_VENUES, SIGNATURE_VENUE_REGEX, foldVenueName, signatureVenueOf } from './venues-signature'
import { inParisArea, museumHours, nearbyParams, roundCoord, venuePins } from './nearby'
import type { CardEvent } from './events/types'

describe('works', () => {
  it('uses the film key', () => {
    expect(workSlug('Notre-Dame de Paris')).toBe('notre-dame-de-paris')
    expect(workSlug('CYRANO  ')).toBe('cyrano')
    expect(workSlug('L’Œdipe roi')).toBe('l-dipe-roi')
  })

  it('builds a LIKE pattern every title of the work matches', () => {
    const slug = workSlug('Notre-Dame de Paris')
    const re = new RegExp('^' + workLikePattern(slug).replace(/%/g, '.*') + '$')
    expect(workLikePattern(slug)).toBe('%notre%dame%de%paris%')
    // Folded event text: title + short description + keywords.
    expect(re.test('notre-dame de paris le spectacle musical culte')).toBe(true)
    expect(re.test('l’œdipe roi')).toBe(false)
  })

  it('rejects generic titles and slugs the trigram index cannot use', () => {
    expect(isGenericWorkSlug('concert')).toBe(true)
    expect(isGenericWorkSlug('visite-guidee')).toBe(true)
    expect(isGenericWorkSlug('concert-de-jazz')).toBe(true)
    expect(isGenericWorkSlug('jam-session')).toBe(true)
    expect(isGenericWorkSlug('m')).toBe(true)
    expect(isGenericWorkSlug('ab-cd')).toBe(true)
    expect(isGenericWorkSlug('cyrano')).toBe(false)
    expect(isGenericWorkSlug('macbeth')).toBe(false)
    expect(isGenericWorkSlug('notre-dame-de-paris')).toBe(false)
  })

  const date = (id: string, startDate: string, venue: string | null, extra: Partial<WorkDate> = {}) => ({
    id,
    slug: id,
    startDate,
    endDate: null,
    timeKnown: true,
    priceMin: 0,
    priceMax: 0,
    priceStatus: 'unknown' as const,
    isFree: false,
    bookingUrl: null,
    sourceUrl: null,
    source: 'x',
    ...extra,
    venue: venue ? { slug: venue } : null,
  })

  it('groups dates by venue, venues by next date, with price range and first booking link', () => {
    const groups = groupWorkByVenue([
      date('b2', '2026-10-20T18:00:00Z', 'b', { priceStatus: 'paid', priceMin: 2500, priceMax: 4000 }),
      date('a1', '2026-10-12T18:00:00Z', 'a', { bookingUrl: 'https://a.fr/1' }),
      date('b1', '2026-10-10T18:00:00Z', 'b', { priceStatus: 'paid', priceMin: 1800, priceMax: 3000, sourceUrl: 'https://b.fr' }),
      date('a2', '2026-10-15T18:00:00Z', 'a', { priceStatus: 'free' }),
    ])
    expect(groups.map((g) => g.key)).toEqual(['b', 'a'])
    expect(groups[0].dates.map((d) => d.id)).toEqual(['b1', 'b2'])
    expect(groups[0]).toMatchObject({ priceMin: 1800, priceMax: 4000, anyFree: false, bookingUrl: 'https://b.fr' })
    expect(groups[1]).toMatchObject({ priceMin: 0, priceMax: 0, anyFree: true, bookingUrl: 'https://a.fr/1' })
  })

  it('picks title, picture and text from the best rows', () => {
    const rows = [
      { title: 'Cyrano', imageUrl: null, description: 'Long texte '.repeat(10), shortDesc: null, qualityScore: 80 },
      { title: 'CYRANO', imageUrl: 'https://img/1.jpg', description: null, shortDesc: 'Court', qualityScore: 40 },
      { title: 'Cyrano', imageUrl: 'https://img/2.jpg', description: 'Bref', shortDesc: null, qualityScore: 60 },
    ]
    expect(bestWorkTitle(rows)).toBe('Cyrano')
    expect(bestWorkImage(rows)).toBe('https://img/2.jpg')
    expect(bestWorkText(rows)?.startsWith('Long texte')).toBe(true)
    expect(bestWorkText([rows[1]])).toBe('Court')
  })
})

describe('lieux phares', () => {
  const yes = [
    'Philharmonie de Paris',
    'Philharmonie de Paris - Grande salle Pierre Boulez',
    'Cité de la musique',
    'Théâtre du Châtelet',
    'Palais Garnier',
    'Opéra Bastille',
    'Comédie-Française',
    'Comédie-Française - Salle Richelieu',
    'Théâtre de la Ville - Sarah Bernhardt',
    'Odéon - Théâtre de l’Europe',
    'L’Olympia',
    'Olympia',
    'Le Bataclan',
    'La Cigale',
    'Zénith Paris - La Villette',
    'Accor Arena',
    'New Morning',
    'Duc des Lombards',
    'Sunset-Sunside',
    'Le Point Virgule',
    'Centre Pompidou',
    'Musée du Louvre',
    "Musée d'Orsay",
    'Grand Palais',
    'Musée du Luxembourg',
    'Fondation Louis Vuitton',
    'Palais de Tokyo',
    'Bourse de Commerce - Pinault Collection',
    'Cinémathèque française',
    'Forum des images',
    'Grande Halle de la Villette',
    'La Gaîté Lyrique',
    'Le Centquatre-Paris',
    'La Seine Musicale',
    'Maison de la Radio et de la Musique',
    'Théâtre du Rond-Point',
    'La Colline - théâtre national',
    'Théâtre des Bouffes du Nord',
    'Cartoucherie - Théâtre du Soleil',
    'MC93',
    'Auditorium Michel Laclotte Musée du Louvre',
    'Musée du Louvre, auditorium Michel Laclotte',
    'Parc de la Villette - Grande Halle',
    'Opéra de Paris - Palais Garnier',
    'Théâtre National de l’Opéra Comique',
    'LE POINT VIRGULE',
    'Le Sunset/Sunside',
    'Zenith de Paris La Villette',
    'Le CENTQUATRE-PARIS (104)',
  ]
  const no = [
    'Bar Le Sunset Rooftop',
    'Les Olympiades',
    'Oratoire du Louvre',
    'Hôtel du Louvre',
    'La Cigalière',
    'Café de la Ville',
    'Grand Palais des Glaces',
    'Le Petit Bain',
    'Point Éphémère',
    // Seen in the venues table (9 Oct 2026): meeting points and other venues.
    'Metro Palais Royal - Musée du Louvre',
    'Isleta central de la plaza Opéra Garnier, frente al Café de la Paix',
    'Bateau Paris Canal / Embarquement Parc De la Villette',
    'La Ferme du Parc de la Villette',
    'Le Grand Point-Virgule',
  ]
  it.each(yes)('matches %s', (name) => expect(signatureVenueOf(name)).not.toBeNull())
  it.each(no)('does not match %s', (name) => expect(signatureVenueOf(name)).toBeNull())

  it('keeps ~40 entries and a regex Postgres can read (no JS-only syntax)', () => {
    expect(SIGNATURE_VENUES.length).toBeGreaterThanOrEqual(40)
    expect(SIGNATURE_VENUE_REGEX).not.toMatch(/\\[bBdDwWsS]|\(\?|'/)
  })

  it('folds like the SQL side (lower + accent table)', () => {
    expect(foldVenueName('  Théâtre   du CHÂTELET ')).toBe('theatre du chatelet')
  })
})

describe('autour de moi', () => {
  it('rounds positions to a ~200 m grid', () => {
    expect(roundCoord(48.85661)).toBe(48.856)
    expect(roundCoord(2.35225)).toBe(2.352)
    expect(roundCoord(48.8571)).toBe(48.858)
  })

  it('knows the Paris area (same bounds as the API)', () => {
    expect(inParisArea(48.8566, 2.3522)).toBe(true)
    expect(inParisArea(45.76, 4.83)).toBe(false)
  })

  it('builds the API queries: next 3 hours by distance, exhibitions open now', () => {
    const p = nearbyParams({ lat: 48.85661, lng: 2.35225, radius: 2 }, true)
    const ev = new URLSearchParams(p.events)
    expect(Object.fromEntries(ev)).toMatchObject({ lat: '48.856', lng: '2.352', radius: '2', sort: 'distance', when: 'next3h', xcat: 'cinema,expos' })
    const ex = new URLSearchParams(p.expos)
    expect(Object.fromEntries(ex)).toMatchObject({ when: 'now', cat: 'expos', sort: 'distance' })
    const arr = new URLSearchParams(nearbyParams({ arr: '11e' }, false).events)
    expect(Object.fromEntries(arr)).toMatchObject({ arr: '11e', sort: 'soon', xcat: 'expos' })
    expect(arr.has('lat')).toBe(false)
  })

  it('only shows exhibitions during museum hours (Paris time)', () => {
    expect(museumHours(new Date('2026-10-07T13:00:00Z'))).toBe(true) // 15h Paris
    expect(museumHours(new Date('2026-10-07T20:00:00Z'))).toBe(false) // 22h Paris
  })

  it('numbers one pin per venue in list order', () => {
    const ev = (id: string, slug: string | null) =>
      ({ id, venue: slug ? { slug, name: slug, arrondissement: null, lat: 48.85, lng: 2.35 } : null }) as unknown as CardEvent
    expect(venuePins([ev('1', 'a'), ev('2', 'b'), ev('3', 'a'), ev('4', null)]).map((p) => [p.key, p.label])).toEqual([
      ['a', 1],
      ['b', 2],
    ])
  })
})
