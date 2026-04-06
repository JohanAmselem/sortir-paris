import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  smallint,
  timestamp,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * Article types:
 * - actualite: Hot news (opening, announcement, festival)
 * - selection: Curated picks ("5 expos this weekend")
 * - focus: Venue/place spotlight
 * - tendance: Cultural trend piece
 * - interview: Narrative/fictional interview
 */

export const articles = pgTable(
  'articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    slug: text('slug').unique().notNull(),
    excerpt: text('excerpt').notNull(),
    content: text('content').notNull(),
    imageUrl: text('image_url'),
    imageAlt: text('image_alt'),

    // Article classification
    type: text('type', {
      enum: ['actualite', 'selection', 'focus', 'tendance', 'interview'],
    }).notNull(),
    category: text('category'),

    // SEO
    metaTitle: text('meta_title'),
    metaDescription: text('meta_description'),
    keywords: text('keywords'),

    // Engagement & priority
    priority: smallint('priority').default(5).notNull(),
    engagementScore: integer('engagement_score').default(0).notNull(),
    viewCount: integer('view_count').default(0).notNull(),

    // Tags stored as comma-separated for simplicity
    tags: text('tags'),

    // Linked event IDs (comma-separated UUIDs)
    relatedEventIds: text('related_event_ids'),

    // Publication state
    status: text('status', {
      enum: ['draft', 'published', 'archived'],
    })
      .default('published')
      .notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow().notNull(),

    // Source tracking for auto-generation
    generatedBy: text('generated_by').default('manual'),
    sourceUrls: text('source_urls'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_articles_slug').on(table.slug),
    index('idx_articles_published').on(table.publishedAt).where(sql`status = 'published'`),
    index('idx_articles_type').on(table.type).where(sql`status = 'published'`),
    index('idx_articles_priority').on(table.priority, table.publishedAt),
  ]
)
