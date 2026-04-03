import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// Schema imports
import * as usersSchema from './schema/users'
import * as eventsSchema from './schema/events'
import * as venuesSchema from './schema/venues'
import * as categoriesSchema from './schema/categories'
import * as tagsSchema from './schema/tags'
import * as interactionsSchema from './schema/interactions'
import * as ingestionSchema from './schema/ingestion'

// Schema exports
export * from './schema/users'
export * from './schema/events'
export * from './schema/venues'
export * from './schema/categories'
export * from './schema/tags'
export * from './schema/interactions'
export * from './schema/ingestion'

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
}

const client = postgres(connectionString, {
  prepare: false,
  connect_timeout: 10,
  idle_timeout: 20,
  max: 3,
  connection: {
    application_name: 'panameclub-web',
  },
})
export const db = drizzle(client, { schema })
