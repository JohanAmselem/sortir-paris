/**
 * "Lieux phares": the big, well-known cultural venues of Paris. Factual
 * curation (institutions everyone knows), not editorial opinion: no rating, no
 * "coup de cœur". Stored as matching RULES on the venue name, never as ids, so
 * aliases created by the scrapers ("Philharmonie de Paris - Grande salle
 * Pierre Boulez", "Cité de la musique") match too.
 *
 * Each pattern is a regular expression applied to the FOLDED venue name
 * (lowercase, French accents removed, same transform as foldSql in
 * lib/events/query.ts). Patterns use only syntax that JS RegExp and Postgres
 * POSIX regexes read the same way (no \b, no lookarounds, '.' for ’ and -).
 */
import { ACCENTS_FROM, ACCENTS_TO } from './events/fold'

export interface SignatureVenue {
  /** Display name of the institution. */
  name: string
  pattern: string
}

export const SIGNATURE_VENUES: SignatureVenue[] = [
  // Musique classique, opéra, danse
  { name: 'Philharmonie de Paris', pattern: 'philharmonie de paris|^philharmonie|cite de la musique' },
  { name: 'Théâtre du Châtelet', pattern: 'theatre du chatelet|^(le )?chatelet$' },
  { name: 'Opéra Garnier', pattern: 'palais garnier|^(l.)?opera garnier' },
  { name: 'Opéra Bastille', pattern: 'opera bastille|opera national de paris|^opera de paris' },
  { name: 'Opéra-Comique', pattern: 'opera.comique' },
  { name: 'Théâtre des Champs-Élysées', pattern: 'theatre des champs.elysees' },
  { name: 'Salle Pleyel', pattern: 'salle pleyel' },
  { name: 'Maison de la Radio', pattern: 'maison de la radio' },
  { name: 'La Seine Musicale', pattern: 'seine musicale' },
  { name: 'Chaillot – Théâtre national de la danse', pattern: 'theatre (national )?de chaillot|^chaillot' },
  // Théâtre
  { name: 'Comédie-Française', pattern: 'comedie.francaise' },
  { name: 'Théâtre de la Ville', pattern: 'theatre de la ville' },
  { name: 'Odéon – Théâtre de l’Europe', pattern: 'odeon.{0,5}theatre de l.europe|theatre de l.odeon|ateliers berthier' },
  { name: 'Théâtre du Rond-Point', pattern: 'theatre du rond.point' },
  { name: 'La Colline – Théâtre national', pattern: 'theatre (national )?de la colline|^la colline.{0,5}theatre' },
  { name: 'Théâtre des Bouffes du Nord', pattern: 'bouffes du nord' },
  { name: 'Cartoucherie de Vincennes', pattern: 'cartoucherie|theatre du soleil' },
  { name: 'MC93', pattern: 'mc93|mc 93' },
  { name: 'Le Point Virgule', pattern: '^(le )?point.virgule$' },
  // Salles de concert
  { name: 'L’Olympia', pattern: '^(l.)?olympia( |$)|olympia bruno coquatrix' },
  { name: 'Le Bataclan', pattern: 'bataclan' },
  { name: 'La Cigale', pattern: '^(la )?cigale( |$)' },
  { name: 'Zénith Paris', pattern: '^(le )?zenith( paris| de paris| la villette|$)' },
  { name: 'Accor Arena', pattern: 'accor ?arena|bercy arena|palais omnisports de paris' },
  { name: 'Casino de Paris', pattern: '^casino de paris' },
  { name: 'Folies Bergère', pattern: 'folies bergere' },
  { name: 'New Morning', pattern: 'new morning' },
  { name: 'Duc des Lombards', pattern: 'duc des lombards' },
  { name: 'Sunset-Sunside', pattern: 'sunset.{0,3}sunside|^(le )?sunside|^(le )?sunset$' },
  // Musées et centres d’art
  { name: 'Centre Pompidou', pattern: 'centre (georges.)?pompidou|^pompidou$' },
  { name: 'Musée du Louvre', pattern: '^musee du louvre|^(le )?louvre$|auditorium.{0,40}louvre' },
  { name: 'Musée d’Orsay', pattern: 'musee d.orsay' },
  { name: 'Grand Palais', pattern: '^(le )?grand palais($| - | immersif| rmn|, )' },
  { name: 'Petit Palais', pattern: '^(le )?petit palais' },
  { name: 'Musée du Luxembourg', pattern: 'musee du luxembourg' },
  { name: 'Fondation Louis Vuitton', pattern: 'fondation louis vuitton' },
  { name: 'Palais de Tokyo', pattern: 'palais de tokyo' },
  { name: 'Bourse de Commerce', pattern: 'bourse de commerce' },
  { name: 'Musée du quai Branly', pattern: 'quai branly' },
  { name: 'Institut du monde arabe', pattern: 'institut du monde arabe' },
  { name: 'Musée d’Art moderne de Paris', pattern: 'musee d.art moderne de (la ville de )?paris' },
  // Cinéma et lieux pluridisciplinaires
  { name: 'Cinémathèque française', pattern: 'cinematheque francaise|^(la )?cinematheque$' },
  { name: 'Forum des images', pattern: 'forum des images' },
  { name: 'La Villette', pattern: '^(le )?parc de la villette($| - )|grande halle( de la villette|$)|^(la )?villette$' },
  { name: 'La Gaîté Lyrique', pattern: 'gaite lyrique' },
  { name: 'Le Centquatre', pattern: 'centquatre|^(le )?104( |$)' },
]

/** One regex for SQL (`~`) and JS: any signature venue. */
export const SIGNATURE_VENUE_REGEX = SIGNATURE_VENUES.map((v) => `(${v.pattern})`).join('|')

const compiled = SIGNATURE_VENUES.map((v) => ({ ...v, re: new RegExp(v.pattern) }))

/** Same fold as foldSql in lib/events/query.ts: lower() + accent table (no œ → oe). */
export function foldVenueName(name: string): string {
  let out = ''
  for (const ch of name.toLowerCase()) {
    const i = ACCENTS_FROM.indexOf(ch)
    out += i === -1 ? ch : ACCENTS_TO[i]
  }
  return out.replace(/\s+/g, ' ').trim()
}

/** The signature venue a venue name belongs to, or null. */
export function signatureVenueOf(name: string | null | undefined): SignatureVenue | null {
  if (!name) return null
  const folded = foldVenueName(name)
  const hit = compiled.find((v) => v.re.test(folded))
  return hit ? { name: hit.name, pattern: hit.pattern } : null
}

export const isSignatureVenue = (name: string | null | undefined) => signatureVenueOf(name) !== null
