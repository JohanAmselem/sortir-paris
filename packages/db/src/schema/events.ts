import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  jsonb,
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
    // 'free' | 'paid' | 'unknown' — price_min/max = 0 is ambiguous without it
    priceStatus: text('price_status', { enum: ['free', 'paid', 'unknown'] })
      .default('unknown')
      .notNull(),
    // false when the source only gave a date (stored at 12:00 Paris)
    timeKnown: boolean('time_known').default(true).notNull(),
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
    status: text('status', { enum: ['draft', 'active', 'expired', 'rejected', 'cancelled'] })
      .default('active')
      .notNull(),
    qualityScore: smallint('quality_score').default(0).notNull(),
    qualityReasons: jsonb('quality_reasons').$type<string[]>().default([]).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    // Set on cross-source duplicates: points to the event that is displayed
    canonicalEventId: uuid('canonical_event_id'),

    // Denormalized counters
    saveCount: integer('save_count').default(0).notNull(),
    viewCount: integer('view_count').default(0).notNull(),
    attendanceCount: integer('attendance_count').default(0).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  // Indexes are managed in packages/db/sql/0004_data_quality_schema.sql
  (table) => [
    index('idx_events_live_start').on(table.startDate).where(sql`status = 'active'`),
    index('idx_events_venue_id').on(table.venueId),
    uniqueIndex('idx_events_source_dedup').on(table.source, table.sourceId),
  ]
)
