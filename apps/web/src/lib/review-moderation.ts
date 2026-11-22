/**
 * Modération des avis des membres : filtre des mots inacceptables (insultes,
 * propos haineux, contenu sexuel explicite) et clé d'auteur anonyme qui sert
 * à « ne plus voir ce membre » dans l'appli.
 *
 * Module PUR, partagé avec l'appli (apps/mobile/src/shared) : aucun import
 * serveur. Le filtre tourne des deux côtés : dans l'appli avant l'envoi, et
 * dans l'API avant l'enregistrement (exigence 1.2 de l'App Store).
 */

/** Racines bloquées, déjà normalisées (minuscules, sans accents ni séparateurs). */
const BLOCKED_ROOTS = [
  // Insultes
  'connard', 'connasse', 'salope', 'salaud', 'encule', 'batard', 'pute', 'putain', 'pd', 'fdp',
  'filsdepute', 'ntm', 'nique', 'tg', 'tagueule', 'pouffiasse', 'grognasse', 'trouduc', 'enfoire',
  // Haine
  'negre', 'negro', 'bougnoule', 'bicot', 'youpin', 'gouine', 'travelo', 'siegheil', 'heilhitler',
  // Sexuel explicite
  'sucemoi', 'branlette', 'sodomie',
  // Anglais courant
  'fuck', 'motherfucker', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'nigga', 'faggot', 'whore', 'slut',
]

/**
 * Mots qui ne sont bloqués qu'isolés, parce qu'ils apparaissent aussi dans des
 * mots innocents. Les mots à double sens courants dans un avis de sortie
 * (« retard », « baiser », « pédale », « nazi » pour une pièce historique…)
 * ne sont pas filtrés : les membres les signalent au besoin.
 */
const WHOLE_WORD_ONLY = new Set(['pd', 'tg', 'ntm', 'nique', 'pute', 'shit', 'fdp'])

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '€': 'e' }

/** Minuscules, accents retirés, chiffres « leet » remplacés, lettres répétées réduites. */
export function normalizeForModeration(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[013457@$€]/g, (c) => LEET[c] ?? c)
    .replace(/(.)\1{2,}/g, '$1')
}

/** Vrai si le texte contient un mot bloqué (sur les mots isolés comme sur le texte collé). */
export function containsBlockedWords(text: string | null | undefined): boolean {
  if (!text) return false
  const norm = normalizeForModeration(text)
  const words = norm.split(/[^a-z]+/).filter(Boolean)
  const wordSet = new Set(words)
  const glued = words.join('')
  for (const root of BLOCKED_ROOTS) {
    const r = root
    if (WHOLE_WORD_ONLY.has(r)) {
      if (wordSet.has(r) || wordSet.has(`${r}s`)) return true
      continue
    }
    if (words.some((w) => w.startsWith(r)) || (r.length >= 6 && glued.includes(r))) return true
  }
  return false
}

export const BLOCKED_REVIEW_MESSAGE = 'Ton avis contient des mots que nous ne publions pas. Reformule-le, s’il te plaît.'
