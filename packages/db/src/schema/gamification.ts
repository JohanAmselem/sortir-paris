import { pgTable, uuid, text, smallint, integer, date, timestamp, index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core'
import { users } from './users'
import { events } from './events'

// "J'y vais" — user attendance declarations
export const userAttendances = pgTable(
  'user_attendances',
  {
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    eventId: uuid('event_id')
      .references(() => events.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.eventId] }),
    index('idx_attendances_event').on(table.eventId),
  ]
)

// Match culturel — swipe history
export const userSwipes = pgTable(
  'user_swipes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    eventId: uuid('event_id')
      .references(() => events.id, { onDelete: 'cascade' })
      .notNull(),
    direction: text('direction', { enum: ['right', 'left'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_swipes_user_event').on(table.userId, table.eventId),
    index('idx_swipes_user_date').on(table.userId, table.createdAt),
  ]
)

// Weekly drop — personalized weekly picks
export const weeklyDrops = pgTable(
  'weekly_drops',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    eventIds: text('event_ids').notNull(), // comma-separated UUIDs
    weekStart: date('week_start').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_drops_user_week').on(table.userId, table.weekStart),
  ]
)
