/**
 * Search box synonyms: words that are better understood as filters than as text
 * ("expo" → category, "gratuit" → free, "stand up" → humour). Multi-word phrases
 * are handled before tokenising, so "stand up" is not reduced to "stand".
 */
import { foldText } from './fold'

export interface SearchFilters {
  /** What is left to search as text (null when nothing). */
  q: string | null
  categories: string[]
  intents: string[]
  topics: string[]
  free: boolean
}

type Rule = {
  re: RegExp
  category?: string
  /** Several categories (OR), e.g. a music genre lives in concerts, festivals or soirées. */
  categories?: string[]
  /** Keep the matched words as search text (they narrow within the categories). */
  keepText?: boolean
  intent?: string
  topic?: string
  free?: boolean
}

// Patterns run on folded text (lowercase, no accents), whole words only.
const RULES: Rule[] = [
  { re: /\b(stand[\s-]?up|standup|humour|humoriste|one[\s-]?man[\s-]?show|comedy club)\b/g, topic: 'humour' },
  { re: /\b(en famille|enfants?|kids|jeune public)\b/g, intent: 'en-famille' },
  { re: /\b(gratuite?s?|gratos|entree libre)\b/g, free: true },
  { re: /\b(expos?|expositions?)\b/g, category: 'expos' },
  { re: /\b(concerts?)\b/g, category: 'concerts' },
  { re: /\b(theatres?|pieces? de theatre)\b/g, category: 'theatre' },
  { re: /\b(cine|cinemas?|films?)\b/g, category: 'cinema' },
  { re: /\b(spectacles?)\b/g, category: 'spectacles' },
  { re: /\b(danse)\b/g, category: 'danse' },
  // Music genres: searched as text, but only among musical outings — otherwise
  // "metal" also finds jewellery and sculpture (métal), "rock" climbing, etc.
  {
    re: /\b(metal|metalcore|hard ?rock|hardcore|punk|rock|jazz|blues|rap|hip ?hop|techno|electro|house|reggae|ska|soul|funk|folk|r ?& ?b|rnb|disco|salsa|afrobeats?|grunge|emo|shoegaze|indie)\b/g,
    categories: ['concerts', 'festivals', 'soirees'],
    keepText: true,
  },
]

/**
 * A category word is only turned into a filter when the query is short: in
 * "théâtre de la ville de paris" the word is part of a venue name.
 */
const MAX_WORDS_FOR_CATEGORY = 3

export function extractSearchFilters(raw: string): SearchFilters {
  let t = ` ${foldText(raw).replace(/[’']/g, ' ')} `
  const out: SearchFilters = { q: null, categories: [], intents: [], topics: [], free: false }
  const words = t.trim().split(/\s+/).filter(Boolean).length

  for (const rule of RULES) {
    if ((rule.category || rule.categories) && words > MAX_WORDS_FOR_CATEGORY) continue
    rule.re.lastIndex = 0
    if (!rule.re.test(t)) continue
    rule.re.lastIndex = 0
    if (!rule.keepText) t = t.replace(rule.re, ' ')
    if (rule.category && !out.categories.includes(rule.category)) out.categories.push(rule.category)
    // An explicit category word ("concert jazz") wins over the genre's default set.
    if (rule.categories && !out.categories.length) out.categories.push(...rule.categories)
    if (rule.intent && !out.intents.includes(rule.intent)) out.intents.push(rule.intent)
    if (rule.topic && !out.topics.includes(rule.topic)) out.topics.push(rule.topic)
    if (rule.free) out.free = true
  }

  const matched = out.categories.length + out.intents.length + out.topics.length + Number(out.free)
  if (!matched) {
    out.q = raw.trim() || null
    return out
  }
  const rest = t.replace(/\s+/g, ' ').trim()
  // Leftovers that are only filler words ("de", "un", "les") are dropped.
  out.q = /^(?:(?:a|au|aux|de|des|du|en|et|la|le|les|l|d|un|une|pour|avec|ce|soir|paris)\s*)*$/.test(rest) ? null : rest
  return out
}
