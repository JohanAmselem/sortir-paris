/**
 * "Défi de la semaine" (Club). One challenge per Paris week, picked
 * deterministically from the week start, progress computed from what the
 * member really did (saves and « j'y vais ») — never from invented activity.
 * Pure and unit-tested (challenges.test.ts).
 */

export type ChallengeSlug = 'lieu-phare' | 'gratuit-arrondissement' | 'trois-categories' | 'deux-sorties'

export interface Challenge {
  slug: ChallengeSlug
  title: string
  text: string
  goal: number
  /** Where to look for ideas. */
  href: string
  cta: string
}

export const CHALLENGES: Challenge[] = [
  {
    slug: 'lieu-phare',
    title: 'Découvre un lieu phare où tu n’es jamais allé',
    text: 'Garde ou prévois une sortie dans l’un des 30 lieux les plus programmés de Paris, où tu n’avais encore rien repéré.',
    goal: 1,
    href: '/lieux',
    cta: 'Voir les lieux',
  },
  {
    slug: 'gratuit-arrondissement',
    title: 'Une sortie gratuite dans un arrondissement nouveau pour toi',
    text: 'Garde ou prévois une sortie gratuite dans un arrondissement où tu n’avais encore rien repéré.',
    goal: 1,
    href: '/gratuit',
    cta: 'Sorties gratuites',
  },
  {
    slug: 'trois-categories',
    title: 'Trois envies, une semaine',
    text: 'Garde ou prévois cette semaine des sorties dans 3 catégories différentes.',
    goal: 3,
    href: '/evenements',
    cta: 'Toutes les sorties',
  },
  {
    slug: 'deux-sorties',
    title: 'Deux sorties prévues',
    text: 'Dis « j’y vais » à 2 sorties cette semaine.',
    goal: 2,
    href: '/ce-week-end',
    cta: 'Idées pour le week-end',
  },
]

/** Same challenge for everyone during a Paris week ("YYYY-MM-DD" of its Monday). */
export function challengeForWeek(weekStart: string): Challenge {
  let h = 0
  for (const ch of weekStart) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return CHALLENGES[h % CHALLENGES.length]
}

/** One save or « j'y vais » of the member, with what the challenges need. */
export interface Interest {
  kind: 'save' | 'attend'
  /** ISO date of the save / « j'y vais ». */
  at: string
  /** Canonical venue slug. */
  venueSlug: string | null
  arrondissement: string | null
  categoryId: string | null
  free: boolean
}

export interface ChallengeProgress {
  value: number
  goal: number
  done: boolean
}

/**
 * Progress of a challenge for the week starting at `weekStart` (instant).
 * "New" venue / arrondissement = no save or « j'y vais » there before the week.
 */
export function challengeProgress(
  challenge: Challenge,
  interests: Interest[],
  weekStart: Date,
  topVenueSlugs: string[] = []
): ChallengeProgress {
  const t0 = weekStart.getTime()
  const before = interests.filter((i) => new Date(i.at).getTime() < t0)
  const during = interests.filter((i) => new Date(i.at).getTime() >= t0)
  let value = 0
  switch (challenge.slug) {
    case 'lieu-phare': {
      const top = new Set(topVenueSlugs)
      const known = new Set(before.map((i) => i.venueSlug).filter(Boolean))
      value = new Set(during.filter((i) => i.venueSlug && top.has(i.venueSlug) && !known.has(i.venueSlug)).map((i) => i.venueSlug)).size
      break
    }
    case 'gratuit-arrondissement': {
      const known = new Set(before.map((i) => i.arrondissement).filter(Boolean))
      value = new Set(during.filter((i) => i.free && i.arrondissement && !known.has(i.arrondissement)).map((i) => i.arrondissement)).size
      break
    }
    case 'trois-categories':
      value = new Set(during.map((i) => i.categoryId).filter(Boolean)).size
      break
    case 'deux-sorties':
      value = during.filter((i) => i.kind === 'attend').length
      break
  }
  const capped = Math.min(value, challenge.goal)
  return { value: capped, goal: challenge.goal, done: capped >= challenge.goal }
}

/** Top venues the member never saved anything at (ideas for "lieu phare"). */
export function unvisitedTopVenues<T extends { slug: string }>(top: T[], interests: Interest[], max = 3): T[] {
  const known = new Set(interests.map((i) => i.venueSlug))
  return top.filter((v) => !known.has(v.slug)).slice(0, max)
}
