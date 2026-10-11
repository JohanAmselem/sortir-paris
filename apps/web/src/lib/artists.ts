/**
 * Artist keys (alertes artistes). Must produce exactly what
 * scrapers/utils/artists.py writes into event_artists.artist_key:
 *   accents removed (unaccent) + lowercase, every non-alphanumeric character
 *   → space, spaces collapsed, trimmed; valid between 2 and 80 characters.
 * A followed artist is user_follows(kind 'artist', term = artist key).
 */

export const ARTIST_KEY_MIN = 2
export const ARTIST_KEY_MAX = 80

/** Letters NFKD does not decompose (what unaccent maps them to). */
const SPECIAL: Record<string, string> = {
  œ: 'oe',
  æ: 'ae',
  ø: 'o',
  ß: 'ss',
  đ: 'd',
  ð: 'd',
  ł: 'l',
  þ: 'th',
  ı: 'i',
}

export function artistKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    // Recompose what is left (Hangul syllables, …).
    .normalize('NFC')
    .replace(/[œæøßđðłþı]/g, (c) => SPECIAL[c] ?? c)
    // ASCII only, exactly like the Python key (unidecode + [^a-z0-9]): a name in
    // another script yields no key here (Python would transliterate it), so such
    // follows are refused rather than silently never matching.
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function isValidArtistKey(key: string): boolean {
  return key.length >= ARTIST_KEY_MIN && key.length <= ARTIST_KEY_MAX && key === artistKey(key)
}

/** Clean display name: whitespace collapsed, 120 characters at most (event_artists.name). */
export function artistDisplayName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, 120)
}

/**
 * Whole-word match of an artist key in a title ("metal" ≠ "Métallos"): both
 * sides are reduced to artist keys, then compared on word boundaries.
 */
export function titleHasArtist(title: string, key: string): boolean {
  const k = artistKey(key)
  if (k.length < ARTIST_KEY_MIN) return false
  return ` ${artistKey(title)} `.includes(` ${k} `)
}
