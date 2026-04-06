import { pgTable, uuid, text, smallint, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { users } from './users'
import { events } from './events'

export const eventReviews = pgTable(
  'event_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    eventId: uuid('event_id')
      .references(() => events.id, { onDelete: 'cascade' })
      .notNull(),
    rating: smallint('rating').notNull(), // 1-5
    comment: text('comment'), // optional text review
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_event_reviews_user_event').on(table.userId, table.eventId),
    index('idx_event_reviews_event').on(table.eventId),
    index('idx_event_reviews_rating').on(table.eventId, table.rating),
  ]
)
