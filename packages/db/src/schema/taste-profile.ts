import {
  pgTable,
  uuid,
  text,
  jsonb,
  smallint,
  timestamp,
} from 'drizzle-orm/pg-core'
import { users } from './users'

// Stores user answers to the taste quiz
export const tasteQuizAnswers = pgTable('taste_quiz_answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  answers: jsonb('answers').notNull(), // Record<questionId, 'a' | 'b'>
  completedAt: timestamp('completed_at', { withTimezone: true }).defaultNow().notNull(),
})

// Computed taste profile from answers
export const tasteProfiles = pgTable('taste_profiles', {
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).primaryKey(),
  // Dimension scores: 0-100 scale
  exploration: smallint('exploration').notNull().default(50),     // 0=safe, 100=adventurous
  energy: smallint('energy').notNull().default(50),               // 0=calm, 100=festive
  social: smallint('social').notNull().default(50),               // 0=solo, 100=crowd
  budget: smallint('budget').notNull().default(50),               // 0=free, 100=premium
  planning: smallint('planning').notNull().default(50),           // 0=spontaneous, 100=planner
  mainstream: smallint('mainstream').notNull().default(50),        // 0=underground, 100=mainstream
  visual: smallint('visual').notNull().default(50),               // 0=auditory, 100=visual
  depth: smallint('depth').notNull().default(50),                 // 0=light, 100=intellectual
  // Computed archetype slug
  archetype: text('archetype').notNull().default('curieux'),
  // Preferred time slots
  preferredTimes: text('preferred_times').default(''),            // comma: morning,afternoon,evening,latenight
  // Summary for AI context
  aiSummary: text('ai_summary').default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
