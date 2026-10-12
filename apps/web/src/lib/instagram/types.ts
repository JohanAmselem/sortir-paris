/**
 * Instagram publishing — shared types (pure, no server imports).
 * Rows live in instagram_posts / instagram_exclusions / instagram_credentials
 * (packages/db/sql/0011_instagram.sql).
 */

export type PostKind = 'carousel' | 'story'
export type PostStatus = 'draft' | 'blocked' | 'publishing' | 'published' | 'failed' | 'skipped'
export type WindowKind = 'demain' | 'semaine' | 'weekend'
export type ExclusionKind = 'venue' | 'source' | 'event'

/** An event as read from the live catalogue, before selection. */
export interface Candidate {
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
  qualityScore: number
  saveCount: number
  source: string
  status: string
  categorySlug: string | null
  venueId: string | null
  venueName: string | null
  venueSlug: string | null
  venueArr: string | null
  venueZip: string | null
  venueCity: string | null
}

/**
 * One slide of a post, stored in instagram_posts.items (snake_case, JSON).
 * Event slides keep a snapshot of the text shown, so the image served to
 * Instagram is the one previewed in the admin (deterministic).
 */
export interface PostItem {
  type: 'cover' | 'event' | 'cta'
  /** cover: headline (« Demain à Paris »), event: event title. */
  title: string
  /** cover: French date line, event: « Lieu · 11e ». */
  subtitle?: string
  /** cover: theme label. event: « Mercredi 15 oct. · 20h ». */
  when?: string
  price?: string
  category?: string | null
  event_id?: string
  slug?: string
  venue_id?: string | null
  venue_slug?: string | null
  source?: string
  image_url?: string | null
  /** Checked at preparation: downloadable and at least MIN_PHOTO_WIDTH px wide. */
  image_ok?: boolean
  /** « Photo : <source ou lieu> ». */
  credit?: string
  /** Story items are published one by one: set once this one is live (never republished). */
  media_id?: string
}

export interface Exclusion {
  kind: ExclusionKind
  value: string
}
