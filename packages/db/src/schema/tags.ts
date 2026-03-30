import { pgTable, uuid, text, primaryKey } from 'drizzle-orm/pg-core'
import { events } from './events'

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').unique().notNull(),
  slug: text('slug').unique().notNull(),
})

export const ambiances = pgTable('ambiances', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').unique().notNull(),
  slug: text('slug').unique().notNull(),
  emoji: text('emoji'),
})

export const eventTags = pgTable(
  'event_tags',
  {
    eventId: uuid('event_id')
      .references(() => events.id, { onDelete: 'cascade' })
      .notNull(),
    tagId: uuid('tag_id')
      .references(() => tags.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.tagId] })]
)

export const eventAmbiances = pgTable(
  'event_ambiances',
  {
    eventId: uuid('event_id')
      .references(() => events.id, { onDelete: 'cascade' })
      .notNull(),
    ambianceId: uuid('ambiance_id')
      .references(() => ambiances.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.ambianceId] })]
)
