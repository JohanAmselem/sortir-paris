import { pgTable, uuid, text, boolean, integer, smallint, timestamp } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  onboarded: boolean('onboarded').default(false).notNull(),
  // Gamification
  xp: integer('xp').default(0).notNull(),
  level: smallint('level').default(1).notNull(),
  badges: text('badges').default('').notNull(), // comma-separated badge slugs
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const userPreferences = pgTable('user_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  categories: uuid('categories').array().default([]).notNull(),
  zones: text('zones').array().default([]).notNull(),
  ambiances: uuid('ambiances').array().default([]).notNull(),
  prefFree: boolean('pref_free').default(false).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
