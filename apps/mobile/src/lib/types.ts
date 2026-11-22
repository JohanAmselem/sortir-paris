/**
 * Réponses des routes existantes du site (hors /api/v1) que l'appli appelle.
 * Les formes suivent les routes de apps/web/src/app/api/* ; les routes /api/v1
 * ont leur contrat partagé dans apps/web/src/lib/api-v1/contract.ts.
 */
import type { CardEvent, EventQuery } from '@/shared'

export interface Recommendation {
  events: CardEvent[]
  total: number
  relaxed: string | null
  /** Requête réellement jouée (après élargissement) : sert au « Tout voir ». */
  query: EventQuery
  /** Intention comprise (« Je veux sortir… » écrit). */
  intent?: { summary?: string; nearMe?: boolean } | null
  source?: 'rules' | 'ai' | 'empty'
  needsLocation?: boolean
}

export interface Suggestions {
  venues: Array<{ name: string; slug: string; area: string | null }>
  categories: Array<{ label: string; href: string }>
  events: Array<{ title: string; href: string; venue: string | null }>
}

export interface MapFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: { slug: string; name: string; arr: string | null; n: number; free: number; cat: string; top: string }
}

export interface MapResponse {
  type: 'FeatureCollection'
  features: MapFeature[]
}

export interface AttendanceInfo {
  count: number
  isAttending: boolean
  open: boolean
}

export interface GamificationResult {
  xp: number | null
  level: number | null
  newBadges: string[]
}

export interface FollowState {
  following: boolean
  id: string | null
}

export interface ArtistSuggestion {
  key: string
  name: string
  dates: number
}

export interface ArtistDate {
  key: string
  slug: string
  title: string
  startDate: string
  timeKnown: boolean
  venueName: string | null
}

export interface SwipeDeck {
  events: CardEvent[]
  loggedIn: boolean
  swipesToday: number
  dailyLimit: number
  remaining: number
  liked: CardEvent[]
}

export interface DropResponse {
  weekStart: string
  events: CardEvent[]
  ended: number
  personalized: boolean
  archetype: string | null
  isNew: boolean
  error: boolean
  loggedIn: boolean
}

export interface AdnResponse {
  categories: Array<{ slug: string; name: string; count: number; percentage: number }>
  totalInteractions: number
  profile: {
    archetype: string
    summary: string | null
    scores: Record<string, number>
    updatedAt: string
  } | null
  xp: number
  level: { level: number; name: string; minXp: number }
  nextLevel: { level: number; name: string; minXp: number } | null
  xpProgress: number
  badges: string[]
}

export interface ReviewsResponse {
  reviews: Array<{ id: string; rating: number; comment: string | null; createdAt: string; userAvatar: string | null; userName: string | null; /** Clé anonyme de l'auteur (absente avant la mise à jour du site). */ authorKey?: string }>
  stats: { avgRating: number | null; totalReviews: number }
  userReview: { rating: number; comment: string | null } | null
  canReview: boolean
  loggedIn: boolean
}

export interface TasteQuizState {
  completed: boolean
  profile: { archetype: string; summary: string | null; scores: Record<string, number> } | null
  answers: Record<string, 'a' | 'b'>
  completedAt: string | null
}
