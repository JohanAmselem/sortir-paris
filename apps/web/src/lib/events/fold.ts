/** Lowercase + strip accents. Shared by search (SQL side mirrors it) and intent parsing. */
export function foldText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
}

/**
 * Accent table of the SQL fold (translate(lower(x), FROM, TO)). Kept here so the
 * JS mirror below produces exactly what Postgres computes.
 */
export const ACCENTS_FROM = 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ'
export const ACCENTS_TO = 'aaaaaaceeeeiiiinooooouuuuyy'

/**
 * Film key: séances of the same film share it ("L’Invitation" and "L'invitation"
 * → "l-invitation"). Must stay identical to filmKeySql in lib/events/query.ts.
 */
export function filmSlug(title: string): string {
  let folded = ''
  for (const ch of title.toLowerCase()) {
    const i = ACCENTS_FROM.indexOf(ch)
    folded += i === -1 ? ch : ACCENTS_TO[i]
  }
  return folded.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
