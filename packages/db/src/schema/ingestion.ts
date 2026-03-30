import { pgTable, uuid, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const ingestionLogs = pgTable('ingestion_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: text('source').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: text('status', {
    enum: ['running', 'success', 'partial', 'failed'],
  }).notNull(),
  eventsFound: integer('events_found').default(0).notNull(),
  eventsNew: integer('events_new').default(0).notNull(),
  eventsUpdated: integer('events_updated').default(0).notNull(),
  eventsDuped: integer('events_duped').default(0).notNull(),
  errors: jsonb('errors').default([]).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
