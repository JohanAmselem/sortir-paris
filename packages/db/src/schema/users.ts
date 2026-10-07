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
  categories: text('categories').array().default([]).notNull(), // category slugs
  zones: text('zones').array().default([]).notNull(),
  ambiances: text('ambiances').array().default([]).notNull(), // ambiance slugs
  prefFree: boolean('pref_free').default(false).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const newsletterSubscribers = pgTable('newsletter_subscribers', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  confirmed: boolean('confirmed').default(false).notNull(),
  confirmToken: text('confirm_token'),
  unsubscribed: boolean('unsubscribed').default(false).notNull(),
  source: text('source'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
})
