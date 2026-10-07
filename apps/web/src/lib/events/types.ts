/**
 * Lean, serialisable event shape used by every card and list.
 * Dates are ISO strings so results can go through the Next data cache.
 */
export interface CardEvent {
  id: string
  slug: string
  title: string
  shortDesc: string | null
  imageUrl: string | null
  startDate: string
  endDate: string | null
  timeKnown: boolean
  priceMin: number
  priceMax: number
  priceStatus: 'free' | 'paid' | 'unknown'
  isFree: boolean
  saveCount: number
  qualityScore: number
  category: { slug: string; name: string; icon: string | null } | null
  venue: {
    name: string
    slug: string
    arrondissement: string | null
    lat: number | null
    lng: number | null
  } | null
  /** Distance in km when the query was geolocated. */
  distanceKm?: number | null
  /** Why this event is shown (recommendations, AI search). */
  reason?: string | null
}

export type SortKey = 'relevance' | 'soon' | 'popular' | 'distance' | 'ending' | 'random'

export interface EventQuery {
  /** Window key ('tonight', 'weekend'…) or YYYY-MM-DD. Default: everything live. */
  when?: string | null
  categories?: string[]
  /** Arrondissements: '1er', '2e' … '20e' */
  arrondissements?: string[]
  free?: boolean
  /** Max price in euros (free events included). */
  maxPrice?: number | null
  intents?: string[]
  near?: { lat: number; lng: number; radiusKm?: number } | null
  q?: string | null
  venueSlug?: string | null
  excludeIds?: string[]
  /** Restrict to these ids (still live only). */
  ids?: string[]
  /** Only long runs (exhibitions, seasons) ending within N days. */
  runsEndingWithinDays?: number | null
  /** Only one-off events (no exhibitions / long runs). */
  oneOffOnly?: boolean
  /** Only events with an image (homepage blocks). */
  withImage?: boolean
  sort?: SortKey
  limit?: number
  offset?: number
}

export interface EventPage {
  events: CardEvent[]
  total: number
  hasMore: boolean
}
