import { pgTable, uuid, text, integer, jsonb, smallint, date, timestamp, index, unique } from 'drizzle-orm/pg-core'

/**
 * Automatic Instagram publishing. Managed in packages/db/sql/0011_instagram.sql
 * (server only, RLS on, no anon/authenticated access).
 */

/** One row per planned publication (carousel or story set), never twice the same (kind, theme, day). */
export const instagramPosts = pgTable(
  'instagram_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind', { enum: ['carousel', 'story'] }).notNull(),
    theme: text('theme').notNull(),
    /** Paris day of publication (YYYY-MM-DD). */
    forDate: date('for_date', { mode: 'string' }).notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    status: text('status', { enum: ['draft', 'blocked', 'publishing', 'published', 'failed', 'skipped'] })
      .default('draft')
      .notNull(),
    caption: text('caption'),
    /** Slides in order (see apps/web/src/lib/instagram/types.ts, PostItem). */
    items: jsonb('items').$type<unknown[]>().default([]).notNull(),
    mediaId: text('media_id'),
    permalink: text('permalink'),
    error: text('error'),
    attempts: integer('attempts').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    unique('instagram_posts_kind_theme_for_date_key').on(table.kind, table.theme, table.forDate),
    index('idx_instagram_posts_due').on(table.status, table.scheduledAt),
  ]
)

/** A venue (id or slug), a source or an event that must never appear again. */
export const instagramExclusions = pgTable(
  'instagram_exclusions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind', { enum: ['venue', 'source', 'event'] }).notNull(),
    value: text('value').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique('instagram_exclusions_kind_value_key').on(table.kind, table.value)]
)

/** Access to the Instagram account (single row, id = 1). Long-lived token, refreshed automatically. */
export const instagramCredentials = pgTable('instagram_credentials', {
  id: smallint('id').primaryKey().default(1),
  igUserId: text('ig_user_id').notNull(),
  username: text('username'),
  accessToken: text('access_token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
