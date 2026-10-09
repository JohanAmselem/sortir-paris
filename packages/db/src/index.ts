import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import postgres from 'postgres'

// Schema imports
import * as usersSchema from './schema/users'
import * as eventsSchema from './schema/events'
import * as venuesSchema from './schema/venues'
import * as categoriesSchema from './schema/categories'
import * as tagsSchema from './schema/tags'
import * as interactionsSchema from './schema/interactions'
import * as ingestionSchema from './schema/ingestion'
import * as articlesSchema from './schema/articles'
import * as reviewsSchema from './schema/reviews'
import * as gamificationSchema from './schema/gamification'
import * as tasteProfileSchema from './schema/taste-profile'

// Schema exports
export * from './schema/users'
export * from './schema/events'
export * from './schema/venues'
export * from './schema/categories'
export * from './schema/tags'
export * from './schema/interactions'
export * from './schema/ingestion'
export * from './schema/articles'
export * from './schema/reviews'
export * from './schema/gamification'
export * from './schema/taste-profile'

// DB client with full schema for query builder
const connectionString = process.env.DATABASE_URL!

const schema = {
  ...usersSchema,
  ...eventsSchema,
  ...venuesSchema,
  ...categoriesSchema,
  ...tagsSchema,
  ...interactionsSchema,
  ...ingestionSchema,
  ...articlesSchema,
  ...reviewsSchema,
  ...gamificationSchema,
  ...tasteProfileSchema,
}

// Pool sizing: Vercel Fluid compute shares one instance between concurrent
// requests, so a pool of 3 queued requests forever when a connection stalled.
// Connections are recycled; the server-side statement_timeout is set on the
// role (see packages/db/sql/0004) because Supavisor drops startup parameters.
const client = postgres(connectionString, {
  prepare: false, // required by the Supavisor transaction pooler
  connect_timeout: 5,
  idle_timeout: 20,
  max_lifetime: 60 * 10,
  max: Number(process.env.DB_POOL_MAX ?? 8),
  connection: {
    application_name: 'panameclub-web',
  },
})
export const db = drizzle(client, { schema })

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Run read queries with a server-side time limit. A query abandoned by the app
 * (withTimeout) used to keep running in Postgres and pile up under load; with
 * SET LOCAL the database itself cancels it. Works through the Supavisor
 * transaction pooler (startup parameters and role settings do not).
 */
export function withStatementTimeout<T>(ms: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`set local statement_timeout = ${Math.max(100, Math.round(ms))}`))
    return fn(tx)
  })
}
