// =========================================
// PANAME CLUB — Gamification System
// =========================================

// XP rewards for actions
export const XP_REWARDS = {
  REVIEW: 15,         // noter un event
  COMMENT: 10,        // ajouter un commentaire à la note
  SAVE: 5,            // sauvegarder un event
  ATTEND: 30,         // cliquer "J'y vais"
  SWIPE: 2,           // swiper un event
  INVITE: 50,         // inviter un ami (future)
  FIRST_REVIEW: 25,   // bonus premier avis
  STREAK_7: 50,       // 7 jours d'affilée
} as const

// Level thresholds
export interface Level {
  level: number
  name: string
  minXp: number
  emoji: string
  color: string
}

export const LEVELS: Level[] = [
  { level: 1, name: 'Curieux',       minXp: 0,    emoji: '🌱', color: 'text-emerald-500' },
  { level: 2, name: 'Explorateur',   minXp: 100,  emoji: '🧭', color: 'text-blue-500' },
  { level: 3, name: 'Connaisseur',   minXp: 300,  emoji: '🎩', color: 'text-purple-500' },
  { level: 4, name: 'Expert',        minXp: 700,  emoji: '⭐', color: 'text-amber-500' },
  { level: 5, name: 'Légende',       minXp: 1500, emoji: '👑', color: 'text-amber-400' },
]

// Badge definitions
export const BADGES = {
  'first-review':     { name: 'Critique',          emoji: '✍️',  desc: 'Premier avis publié' },
  'five-reviews':     { name: 'Critique averti',    emoji: '📝',  desc: '5 avis publiés' },
  'ten-reviews':      { name: 'Plume d\'or',       emoji: '🏅',  desc: '10 avis publiés' },
  'first-attend':     { name: 'Participant',        emoji: '🙋',  desc: 'Premier "J\'y vais"' },
  'night-owl':        { name: 'Noctambule',         emoji: '🦉',  desc: '5 sorties après 22h' },
  'culture-vulture':  { name: 'Éclectique',         emoji: '🦅',  desc: '5 catégories différentes' },
  'free-spirit':      { name: 'Bon plan',           emoji: '🆓',  desc: '10 événements gratuits' },
  'social-butterfly': { name: 'Social',             emoji: '🦋',  desc: '10 "J\'y vais"' },
  'match-master':     { name: 'Matcheur',           emoji: '🔥',  desc: '50 swipes' },
  'explorer-paris':   { name: 'Parisien·ne',       emoji: '🗼',  desc: '5 arrondissements visités' },
} as const

export type BadgeSlug = keyof typeof BADGES

export function getLevelForXp(xp: number): Level {
  let current = LEVELS[0]
  for (const lvl of LEVELS) {
    if (xp >= lvl.minXp) current = lvl
  }
  return current
}

export function getNextLevel(xp: number): Level | null {
  const current = getLevelForXp(xp)
  const nextIdx = LEVELS.findIndex(l => l.level === current.level) + 1
  return nextIdx < LEVELS.length ? LEVELS[nextIdx] : null
}

export function getXpProgress(xp: number) {
  const current = getLevelForXp(xp)
  const next = getNextLevel(xp)
  if (!next) return { current, next: null, progress: 100, xpInLevel: 0, xpNeeded: 0 }

  const xpInLevel = xp - current.minXp
  const xpNeeded = next.minXp - current.minXp
  const progress = Math.min(100, Math.round((xpInLevel / xpNeeded) * 100))

  return { current, next, progress, xpInLevel, xpNeeded }
}

// ADN Paname — cultural profile categories
export const ADN_CATEGORIES = [
  { key: 'concerts', label: 'Musique', emoji: '🎵', color: '#7C3AED' },
  { key: 'expos', label: 'Expos', emoji: '🖼️', color: '#F59E0B' },
  { key: 'theatre', label: 'Théâtre', emoji: '🎭', color: '#EF4444' },
  { key: 'festivals', label: 'Festivals', emoji: '🎪', color: '#10B981' },
  { key: 'ateliers', label: 'Ateliers', emoji: '🎨', color: '#3B82F6' },
  { key: 'visites', label: 'Visites', emoji: '🚶', color: '#8B5CF6' },
  { key: 'cinema', label: 'Cinéma', emoji: '🎬', color: '#EC4899' },
  { key: 'danse', label: 'Danse', emoji: '💃', color: '#F43F5E' },
  { key: 'spectacles', label: 'Spectacles', emoji: '✨', color: '#6366F1' },
  { key: 'conferences', label: 'Conférences', emoji: '🎤', color: '#14B8A6' },
] as const
