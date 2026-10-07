/**
 * Categories, arrondissements and "intents" (how people actually decide to go
 * out). Intents are computed from the data with transparent rules — no hidden
 * table to maintain — and are shared by filters, the homepage and AI search.
 */

export interface CategoryMeta {
  slug: string
  name: string
  plural: string
  icon: string
}

export const CATEGORIES: CategoryMeta[] = [
  { slug: 'concerts', name: 'Concert', plural: 'Concerts', icon: '🎵' },
  { slug: 'expos', name: 'Exposition', plural: 'Expositions', icon: '🎨' },
  { slug: 'theatre', name: 'Théâtre', plural: 'Théâtre', icon: '🎭' },
  { slug: 'spectacles', name: 'Spectacle', plural: 'Spectacles & humour', icon: '🎪' },
  { slug: 'danse', name: 'Danse', plural: 'Danse', icon: '💃' },
  { slug: 'cinema', name: 'Cinéma', plural: 'Cinéma', icon: '🎬' },
  { slug: 'festivals', name: 'Festival', plural: 'Festivals', icon: '🎡' },
  { slug: 'conferences', name: 'Conférence', plural: 'Conférences & rencontres', icon: '🎤' },
  { slug: 'ateliers', name: 'Atelier', plural: 'Ateliers', icon: '🛠️' },
  { slug: 'visites', name: 'Visite', plural: 'Visites & balades', icon: '🏛️' },
]

export const CATEGORY_BY_SLUG = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c])) as Record<
  string,
  CategoryMeta
>

export const ARRONDISSEMENTS = Array.from({ length: 20 }, (_, i) => (i === 0 ? '1er' : `${i + 1}e`))

/** "11", "11e", "11ème", "75011", "XIe" → "11e". Returns null when not a Paris arrondissement. */
export function normalizeArrondissement(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase()
  const zip = /^750(\d{2})$/.exec(s) ?? /^75116$/.exec(s)
  let n: number | null = null
  if (zip) n = s === '75116' ? 16 : Number(zip[1])
  else {
    const m = /^(\d{1,2})\s*(er|e|eme|ème|è)?$/.exec(s)
    if (m) n = Number(m[1])
  }
  if (!n || n < 1 || n > 20) return null
  return n === 1 ? '1er' : `${n}e`
}

export interface IntentMeta {
  slug: string
  label: string
  emoji: string
  /** Short phrase used in "why" explanations. */
  reason: string
}

/** Social / mood intents. SQL rules live in lib/events/query.ts (intentCondition). */
export const INTENTS: IntentMeta[] = [
  { slug: 'en-amoureux', label: 'En amoureux', emoji: '❤️', reason: 'idéal à deux' },
  { slug: 'entre-amis', label: 'Entre amis', emoji: '🥂', reason: 'parfait entre amis' },
  { slug: 'en-famille', label: 'En famille', emoji: '🧸', reason: 'adapté aux enfants' },
  { slug: 'insolite', label: 'Insolite', emoji: '✨', reason: 'sort de l’ordinaire' },
  { slug: 'plein-air', label: 'Plein air', emoji: '🌿', reason: 'en plein air' },
  { slug: 'festif', label: 'Faire la fête', emoji: '🪩', reason: 'ambiance festive' },
  { slug: 'culture-pointue', label: 'Culture pointue', emoji: '🧠', reason: 'pour les curieux' },
  { slug: 'chill', label: 'Tranquille', emoji: '🫖', reason: 'ambiance calme' },
]

export const INTENT_BY_SLUG = Object.fromEntries(INTENTS.map((i) => [i.slug, i])) as Record<string, IntentMeta>

/** Keyword rules (POSIX regex, case-insensitive) matched on title + short description + keywords. */
export const INTENT_RULES: Record<string, { pattern: string; categories?: string[]; excludePattern?: string }> = {
  'en-amoureux': {
    pattern: 'jazz|piano|récital|recital|lyrique|opéra|opera|quatuor|chanson|tango|nocturne|dégustation|degustation|croisière|croisiere|bal |cabaret|romanti|poésie|poesie',
    categories: ['danse', 'theatre'],
    excludePattern: 'enfant|jeune public|bébé|bebe|famille',
  },
  'entre-amis': {
    pattern: 'soirée|soiree|dj|concert|festival|humour|stand-?up|impro|quiz|karaoké|karaoke|blind test|bal |guinguette|apéro|apero|jam',
    categories: ['concerts', 'festivals', 'spectacles'],
    excludePattern: 'bébé|bebe|tout-petits|conférence',
  },
  'en-famille': {
    pattern: 'enfant|famille|familial|jeune public|kids|dès [0-9]+ ans|des [0-9]+ ans|à partir de [0-9]+ ans|conte|marionnette|goûter|gouter|tout-petits|bébé|bebe',
  },
  insolite: {
    pattern: 'insolite|immersi|secret|étonnant|etonnant|atypique|curieux|curiosit|nocturne|souterrain|catacombe|escape|réalité virtuelle|realite virtuelle|inédit|inedit|mystère|mystere',
  },
  'plein-air': {
    pattern: 'plein air|plein-air|jardin|parc |square|extérieur|exterieur|balade|promenade|rooftop|guinguette|en terrasse|berges|canal|bois de',
    categories: ['visites'],
  },
  festif: {
    pattern: 'soirée|soiree|dj|clubbing|électro|electro|fête|fete|party|bal |guinguette|dancefloor|techno|house|disco|carnaval',
    excludePattern: 'enfant|jeune public',
  },
  'culture-pointue': {
    pattern: 'conférence|conference|rencontre|débat|debat|lecture|philosoph|histoire de l|masterclass|colloque|projection-débat|séminaire|seminaire|contemporain',
    categories: ['conferences'],
  },
  chill: {
    pattern: 'exposition|jazz|acoustique|lecture|jardin|musée|musee|piano|méditation|meditation|calme|douceur',
    categories: ['expos'],
    excludePattern: 'dj|clubbing|techno',
  },
}
