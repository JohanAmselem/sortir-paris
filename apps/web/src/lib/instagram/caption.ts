/**
 * Captions — pure (tested in caption.test.ts).
 *
 *   <accroche>                    (IA contrainte, ou modèle)
 *
 *   Demain à Paris · mercredi 15 octobre
 *   • Titre — Lieu · 11e — Mer. 15 oct. · 20h — 12 €
 *   …
 *   Photos : lieux et organisateurs (via …).
 *   Infos à vérifier auprès de l'organisateur.
 *   Lien en bio : panameclub.fr/instagram
 *
 *   #hashtags
 *
 * The event lines and hashtags are always generated here, never by the model.
 */
import { foldText } from '@/lib/events/fold'
import { sourceLabel } from '@/lib/format'
import type { PostItem } from './types'

export const CAPTION_MAX = 2200
export const HOOK_MAX = 220
export const MAX_HASHTAGS = 30
export const LINK_IN_BIO = 'Lien en bio : panameclub.fr/instagram'
export const VERIFY_LINE = 'Infos à vérifier auprès de l’organisateur.'

const TITLE_MAX = 80

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

/** « • Titre — Lieu · 11e — Mer. 15 oct. · 20h — 12 € » */
export function eventLine(item: PostItem): string {
  return ['• ' + clip(item.title, TITLE_MAX), item.subtitle, item.when, item.price].filter(Boolean).join(' — ')
}

export function creditsLine(items: PostItem[]): string | null {
  const sources = [...new Set(items.filter((i) => i.type === 'event' && i.image_ok && i.source).map((i) => sourceLabel(i.source!)))]
  if (!sources.length) return null
  return `Photos : lieux et organisateurs (via ${sources.join(', ')}).`
}

export interface CaptionInput {
  hook: string
  headline: string
  dateLabel: string
  items: PostItem[]
  hashtags: string[]
}

export function buildCaption({ hook, headline, dateLabel, items, hashtags }: CaptionInput): string {
  const tags = hashtags.slice(0, MAX_HASHTAGS).join(' ')
  const events = items.filter((i) => i.type === 'event')
  const credits = creditsLine(items)
  const compose = (lines: string[]) =>
    [hook.trim(), '', `${headline} · ${dateLabel}`, ...lines, '', ...(credits ? [credits] : []), VERIFY_LINE, LINK_IN_BIO, '', tags].join('\n')
  let lines = events.map(eventLine)
  let caption = compose(lines)
  // Too long: drop the last event lines (the slides still show them).
  while (caption.length > CAPTION_MAX && lines.length > 1) {
    lines = lines.slice(0, -1)
    caption = compose([...lines, '• …'])
  }
  return caption.length > CAPTION_MAX ? caption.slice(0, CAPTION_MAX) : caption
}

// ── Hook ────────────────────────────────────────────────────────────────────

/** Template hooks, used when the model is off, fails or says something unverifiable. */
const TEMPLATE_HOOKS: Record<string, string[]> = {
  demain: [
    'Ta sortie de demain est déjà trouvée : voici notre sélection à Paris.',
    'Demain, Paris a du programme. On a fait le tri pour toi.',
    'Pas d’idée pour demain ? Voici ce qui vaut le détour à Paris.',
  ],
  semaine: [
    'Ta semaine à Paris commence ici : nos sorties à ne pas rater.',
    'Une semaine, plein de sorties. Voici notre sélection pour toi.',
  ],
  weekend: [
    'Ton week-end à Paris est prêt : on a fait le tri pour toi.',
    'Pas encore de plan pour le week-end ? Voici notre sélection à Paris.',
  ],
}

export function templateHook(theme: string, seed: string): string {
  const list = TEMPLATE_HOOKS[theme] ?? TEMPLATE_HOOKS.demain
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return list[h % list.length]
}

/** Common French words allowed with a capital letter at the start of a sentence. */
const SENTENCE_STARTERS = new Set(
  (
    'a à au aux avec ce cet cette ces c ça ici demain ce soir ta ton tes ta toi tu tout toute tous toutes ' +
    'de du des le la les l un une on il elle et ou mais pas plus pour par sur si quand que qui quoi quel quelle ' +
    'envie besoin entre pendant cette semaine week end programme sortie sorties paris voici voilà nos notre on ' +
    'pas encore rien jamais déjà enfin bonne belle beau grand grande petit petite pourquoi comment où dès entre ' +
    'musique concert concerts expo expos théâtre humour soirée soirées gratuit famille culture scène ' +
    'rendez vous viens file cap direction place prêt prête découvre sors laisse'
  )
    .split(/\s+/)
    .map(foldText)
)

const DATE_WORDS = new Set(
  'lundi mardi mercredi jeudi vendredi samedi dimanche janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre'.split(' ')
)

// Emoji / pictographs.
const EMOJI_RE = /\p{Extended_Pictographic}/gu

/** Words of a text: letters (accents included), digits, apostrophes split. */
export function tokens(text: string): string[] {
  return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

export type HookCheck = { ok: true; hook: string } | { ok: false; reason: string }

/**
 * Accept the model's hook only if it says nothing we cannot check:
 * every capitalized word (proper noun), every number and every day / month
 * name must appear in the input data. No hashtag, no link, at most one emoji,
 * 220 characters max.
 */
export function validateHook(raw: string, inputText: string): HookCheck {
  const hook = raw.replace(/\s+/g, ' ').replace(/^["«“\s]+|["»”\s]+$/g, '').trim()
  if (hook.length < 15) return { ok: false, reason: 'trop court' }
  if (hook.length > HOOK_MAX) return { ok: false, reason: 'trop long' }
  if (hook.includes('#')) return { ok: false, reason: 'hashtag' }
  if (/https?:|www\.|\.fr\b|\.com\b|@/.test(hook)) return { ok: false, reason: 'lien ou mention' }
  if ((hook.match(EMOJI_RE) ?? []).length > 1) return { ok: false, reason: 'emojis' }
  const sentences = hook.split(/[.!?…:]+\s*/).filter(Boolean)
  if (sentences.length > 3) return { ok: false, reason: 'trop de phrases' }

  const known = new Set(tokens(inputText).map(foldText))
  const sentenceStarts = new Set<number>()
  // Index of each word that starts a sentence.
  let idx = 0
  for (const s of sentences) {
    sentenceStarts.add(idx)
    idx += tokens(s).length
  }
  const words = tokens(hook)
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    const f = foldText(w)
    if (/\d/.test(w) && !known.has(f)) return { ok: false, reason: `nombre inconnu « ${w} »` }
    if (DATE_WORDS.has(f) && !known.has(f)) return { ok: false, reason: `date inconnue « ${w} »` }
    if (/^\p{Lu}/u.test(w) && !known.has(f)) {
      if (sentenceStarts.has(i) && SENTENCE_STARTERS.has(f)) continue
      return { ok: false, reason: `nom propre inconnu « ${w} »` }
    }
  }
  return { ok: true, hook }
}

/** What the model receives (and what its hook is checked against). */
export function hookInput(headline: string, dateLabel: string, items: PostItem[]): string {
  const lines = items.filter((i) => i.type === 'event').map((i) => [i.title, i.subtitle, i.when, i.price, i.category].filter(Boolean).join(' — '))
  return [`${headline} · ${dateLabel}`, ...lines].join('\n')
}
