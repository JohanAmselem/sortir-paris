import { describe, expect, it } from 'vitest'
import { artistDisplayName, artistKey, isValidArtistKey, titleHasArtist } from './artists'

describe('artistKey', () => {
  it('lowercases, removes accents, turns punctuation into spaces', () => {
    expect(artistKey('Beyoncé')).toBe('beyonce')
    expect(artistKey('AC/DC')).toBe('ac dc')
    expect(artistKey('  Sigur   Rós ')).toBe('sigur ros')
    expect(artistKey('M.I.A.')).toBe('m i a')
    expect(artistKey('Ibrahim Maalouf & Friends')).toBe('ibrahim maalouf friends')
    expect(artistKey('Christine and the Queens')).toBe('christine and the queens')
    expect(artistKey("L'Impératrice")).toBe('l imperatrice')
    expect(artistKey('L’Impératrice')).toBe('l imperatrice')
    expect(artistKey('Jul_93')).toBe('jul 93')
  })

  it('folds letters that do not decompose', () => {
    expect(artistKey('Mø')).toBe('mo')
    expect(artistKey('Œdipe')).toBe('oedipe')
    expect(artistKey('Straßenjungs')).toBe('strassenjungs')
    expect(artistKey('Łona')).toBe('lona')
  })

  it('keeps non-latin letters and digits', () => {
    expect(artistKey('BTS 방탄소년단')).toBe('bts 방탄소년단')
    expect(artistKey('2Pac')).toBe('2pac')
  })

  it('is idempotent', () => {
    for (const n of ['AC/DC', 'Beyoncé', 'Mø', 'L’Impératrice']) expect(artistKey(artistKey(n))).toBe(artistKey(n))
  })
})

describe('isValidArtistKey', () => {
  it('accepts normalized keys of 2 to 80 characters', () => {
    expect(isValidArtistKey('mo')).toBe(true)
    expect(isValidArtistKey('ac dc')).toBe(true)
    expect(isValidArtistKey('x')).toBe(false)
    expect(isValidArtistKey('a'.repeat(81))).toBe(false)
    expect(isValidArtistKey('AC/DC')).toBe(false)
    expect(isValidArtistKey(' ac')).toBe(false)
  })
})

describe('titleHasArtist', () => {
  it('matches whole words only', () => {
    expect(titleHasArtist('AC/DC - Power Up Tour', 'ac dc')).toBe(true)
    expect(titleHasArtist('Metal Night', 'metal')).toBe(true)
    expect(titleHasArtist('Les Métallos en fête', 'metal')).toBe(false)
    expect(titleHasArtist('Juliette Armanet en concert', 'juliette armanet')).toBe(true)
    expect(titleHasArtist('Juliette', 'juliette armanet')).toBe(false)
    expect(titleHasArtist('Anything', 'x')).toBe(false)
  })
})

describe('artistDisplayName', () => {
  it('collapses spaces and caps the length', () => {
    expect(artistDisplayName('  Daft   Punk ')).toBe('Daft Punk')
    expect(artistDisplayName('a'.repeat(200))).toHaveLength(120)
  })
})
