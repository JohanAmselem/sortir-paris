import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  smallint,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { categories } from './categories'
import { venues } from './venues'

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    slug: text('slug').unique().notNull(),
    description: text('description'),
    shortDesc: text('short_desc'),
    imageUrl: text('image_url'),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    endDate: timestamp('end_date', { withTimezone: true }),
    priceMin: integer('price_min').default(0).notNull(),
    priceMax: integer('price_max').default(0).notNull(),
    isFree: boolean('is_free').default(false).notNull(),
    bookingUrl: text('booking_url'),
    categoryId: uuid('category_id').references(() => categories.id),
    venueId: uuid('venue_id').references(() => venues.id),

    // Auto-generated keywords for search (space-separated)
    keywords: text('keywords'),

    // Source tracking
    source: text('source').notNull(),
    sourceUrl: text('source_url'),
    sourceId: text('source_id'),

    // Quality & moderation
    status: text('status', { enum: ['draft', 'active', 'expired', 'rejected'] })
      .default('active')
      .notNull(),
    qualityScore: smallint('quality_score').default(0).notNull(),

    // Denormalized counters
    saveCount: integer('save_count').default(0).notNull(),
    viewCount: integer('view_count').default(0).notNull(),
    attendanceCount: integer('attendance_count').default(0).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_events_start_date').on(table.startDate).where(sql`status = 'active'`),
    index('idx_events_category').on(table.categoryId).where(sql`status = 'active'`),
    index('idx_events_venue').on(table.venueId),
    index('idx_events_slug').on(table.slug),
    uniqueIndex('idx_events_source_dedup').on(table.source, table.sourceId),
  ]
)
