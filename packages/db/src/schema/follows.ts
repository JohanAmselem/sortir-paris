import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'
import { venues } from './venues'

/**
 * A member follows a venue (canonical venue id) or an artist / work (normalized term).
 * Managed in packages/db/sql/0009_follows.sql.
 */
export const userFollows = pgTable(
  'user_follows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    kind: text('kind', { enum: ['venue', 'artist'] }).notNull(),
    venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'cascade' }),
    /** Normalized (lowercase, accents folded like the search index), 2–80 chars. */
    term: text('term'),
    label: text('label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    /** For a future e-mail / push sender: last time this follow was notified. */
    lastNotifiedAt: timestamp('last_notified_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('user_follows_unique').on(table.userId, table.kind, sql`(coalesce(${table.venueId}::text, ${table.term}))`),
    index('idx_user_follows_user').on(table.userId),
    index('idx_user_follows_venue').on(table.venueId).where(sql`venue_id is not null`),
  ]
)
