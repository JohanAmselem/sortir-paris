import { pgTable, uuid, text, smallint } from 'drizzle-orm/pg-core'

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').unique().notNull(),
  slug: text('slug').unique().notNull(),
  icon: text('icon'),
  color: text('color'),
  position: smallint('position').default(0).notNull(),
})
