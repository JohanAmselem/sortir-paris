// ============================================
// SORTIR PARIS — Shared Types
// ============================================

// --- Events ---

export type EventStatus = 'draft' | 'active' | 'expired' | 'rejected'

export interface Event {
  id: string
  title: string
  slug: string
  description: string | null
  shortDesc: string | null
  imageUrl: string | null
  startDate: string
  endDate: string | null
  priceMin: number
  priceMax: number
  isFree: boolean
  bookingUrl: string | null
  categoryId: string | null
  venueId: string | null
  source: string
  sourceUrl: string | null
  sourceId: string | null
  status: EventStatus
  qualityScore: number
  saveCount: number
  viewCount: number
  createdAt: string
  updatedAt: string
}

export interface EventWithRelations extends Event {
  category: Category | null
  venue: Venue | null
  tags: Tag[]
  ambiances: Ambiance[]
}

// --- Venues ---

export interface Venue {
  id: string
  name: string
  slug: string
  address: string | null
  city: string
  zipCode: string | null
  arrondissement: string | null
  lat: number | null
  lng: number | null
  website: string | null
  imageUrl: string | null
}

// --- Categories ---

export interface Category {
  id: string
  name: string
  slug: string
  icon: string | null
  color: string | null
  position: number
}

// --- Tags & Ambiances ---

export interface Tag {
  id: string
  name: string
  slug: string
}

export interface Ambiance {
  id: string
  name: string
  slug: string
  emoji: string | null
}

// --- Users ---

export interface UserProfile {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  onboarded: boolean
}

export interface UserPreferences {
  userId: string
  categories: string[]
  zones: string[]
  ambiances: string[]
  prefFree: boolean
}

// --- Search & Filters ---

export interface EventFilters {
  query?: string
  category?: string
  date?: 'today' | 'tomorrow' | 'weekend' | 'week' | string // ISO date
  priceMin?: number
  priceMax?: number
  isFree?: boolean
  zone?: string
  ambiance?: string
  sort?: 'date' | 'popular' | 'relevance'
  page?: number
  limit?: number
}

// --- Meilisearch ---

export interface MeiliEvent {
  id: string
  title: string
  slug: string
  shortDesc: string | null
  description: string | null
  imageUrl: string | null
  startDate: number // unix timestamp
  endDate: number | null
  priceMin: number
  priceMax: number
  isFree: boolean
  bookingUrl: string | null
  category: string | null
  categorySlug: string | null
  venueName: string | null
  arrondissement: string | null
  _geo: { lat: number; lng: number } | null
  tags: string[]
  keywords: string | null
  ambiances: string[]
  saveCount: number
  qualityScore: number
}

// --- API Responses ---

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}
