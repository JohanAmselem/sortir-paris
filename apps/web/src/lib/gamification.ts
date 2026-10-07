/**
 * PANAME CLUB — Gamification.
 *
 * XP, level and badges are DERIVED from what the member actually did
 * (saves, outings, reviews, swipes, quiz). They are recomputed after every
 * action (see app/club/_lib/member.ts → syncGamification), so:
 *   - an action grants XP once per (member, event): saving twice is impossible;
 *   - undoing an action (unsave, "je n'y vais plus", delete review) removes its XP;
 *   - levels and badges can never drift from the data.
 * Everything here is pure and unit-tested (gamification.test.ts).
 */

export const XP_REWARDS = {
  SAVE: 5, // garder un événement
  ATTEND: 30, // « J'y vais »
  REVIEW: 15, // noter une sortie
  COMMENT: 10, // ajouter un commentaire à la note
  FIRST_REVIEW: 25, // bonus premier avis
  SWIPE: 2, // un swipe dans Match
  QUIZ: 50, // profil « Tu préfères » complété
} as const

export interface MemberStats {
  saves: number
  attendances: number
  reviews: number
  /** Reviews with a non-empty comment. */
  comments: number
  swipes: number
  quizDone: boolean
  /** Distinct arrondissements among saved + attended events. */
  arrondissements: number
  /** Distinct categories among saved + attended + reviewed events. */
  categories: number
  /** Saved or attended free events. */
  freeEvents: number
}

export const EMPTY_STATS: MemberStats = {
  saves: 0,
  attendances: 0,
  reviews: 0,
  comments: 0,
  swipes: 0,
  quizDone: false,
  arrondissements: 0,
  categories: 0,
  freeEvents: 0,
}

const n = (v: number) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)

export function computeXp(s: MemberStats): number {
  return (
    n(s.saves) * XP_REWARDS.SAVE +
    n(s.attendances) * XP_REWARDS.ATTEND +
    n(s.reviews) * XP_REWARDS.REVIEW +
    Math.min(n(s.comments), n(s.reviews)) * XP_REWARDS.COMMENT +
    (n(s.reviews) > 0 ? XP_REWARDS.FIRST_REVIEW : 0) +
    n(s.swipes) * XP_REWARDS.SWIPE +
    (s.quizDone ? XP_REWARDS.QUIZ : 0)
  )
}

// ── Levels ────────────────────────────────────────────────────────────────

export interface Level {
  level: number
  name: string
  minXp: number
}

export const LEVELS: Level[] = [
  { level: 1, name: 'Curieux', minXp: 0 },
  { level: 2, name: 'Explorateur', minXp: 100 },
  { level: 3, name: 'Connaisseur', minXp: 300 },
  { level: 4, name: 'Expert', minXp: 700 },
  { level: 5, name: 'Légende', minXp: 1500 },
]

export function getLevelForXp(xp: number): Level {
  let current = LEVELS[0]
  for (const lvl of LEVELS) if (xp >= lvl.minXp) current = lvl
  return current
}

export function getNextLevel(xp: number): Level | null {
  const current = getLevelForXp(xp)
  return LEVELS.find((l) => l.level === current.level + 1) ?? null
}

export function getXpProgress(xp: number) {
  const safeXp = n(xp)
  const current = getLevelForXp(safeXp)
  const next = getNextLevel(safeXp)
  if (!next) return { current, next: null, progress: 100, xpInLevel: safeXp - current.minXp, xpNeeded: 0 }
  const xpInLevel = safeXp - current.minXp
  const xpNeeded = next.minXp - current.minXp
  return { current, next, progress: Math.min(100, Math.round((xpInLevel / xpNeeded) * 100)), xpInLevel, xpNeeded }
}

// ── Badges ────────────────────────────────────────────────────────────────

export interface BadgeDef {
  slug: string
  name: string
  emoji: string
  /** How to unlock it, shown on locked badges. */
  desc: string
  /** Current value / goal, for the progress hint. */
  progress: (s: MemberStats) => { value: number; goal: number }
}

const goal = (value: number, g: number) => ({ value: Math.min(n(value), g), goal: g })

export const BADGES: BadgeDef[] = [
  { slug: 'first-save', name: 'Premier repérage', emoji: '🔖', desc: 'Garder un premier événement', progress: (s) => goal(s.saves, 1) },
  { slug: 'quiz-done', name: 'Profil révélé', emoji: '🧭', desc: 'Terminer le quiz « Tu préfères »', progress: (s) => goal(s.quizDone ? 1 : 0, 1) },
  { slug: 'first-attend', name: 'Dans la place', emoji: '🙋', desc: 'Dire « J’y vais » une première fois', progress: (s) => goal(s.attendances, 1) },
  { slug: 'five-outings', name: 'Habitué', emoji: '🎟️', desc: 'Prévoir 5 sorties', progress: (s) => goal(s.attendances, 5) },
  { slug: 'first-review', name: 'Critique', emoji: '✍️', desc: 'Noter une sortie', progress: (s) => goal(s.reviews, 1) },
  { slug: 'five-reviews', name: 'Plume du club', emoji: '📝', desc: 'Noter 5 sorties', progress: (s) => goal(s.reviews, 5) },
  { slug: 'explorer-paris', name: 'Explorateur', emoji: '🗺️', desc: 'Repérer des sorties dans 5 arrondissements', progress: (s) => goal(s.arrondissements, 5) },
  { slug: 'curieux', name: 'Curieux', emoji: '🎨', desc: 'S’intéresser à 5 catégories différentes', progress: (s) => goal(s.categories, 5) },
  { slug: 'bon-plan', name: 'Bon plan', emoji: '🆓', desc: 'Garder ou prévoir 5 sorties gratuites', progress: (s) => goal(s.freeEvents, 5) },
  { slug: 'match-master', name: 'Matcheur', emoji: '🔥', desc: 'Faire 50 swipes dans Match', progress: (s) => goal(s.swipes, 50) },
]

export const BADGE_BY_SLUG = Object.fromEntries(BADGES.map((b) => [b.slug, b])) as Record<string, BadgeDef>

export function computeBadges(s: MemberStats): string[] {
  return BADGES.filter((b) => {
    const p = b.progress(s)
    return p.value >= p.goal
  }).map((b) => b.slug)
}

/** "a,b" → known badge slugs only. */
export function parseBadges(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s in BADGE_BY_SLUG)
}

export interface GamificationState {
  xp: number
  level: number
  badges: string[]
}

export function computeGamification(s: MemberStats): GamificationState {
  const xp = computeXp(s)
  return { xp, level: getLevelForXp(xp).level, badges: computeBadges(s) }
}
