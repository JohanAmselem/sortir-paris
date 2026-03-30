import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// Schema exports
export * from './schema/users'
export * from './schema/events'
export * from './schema/venues'
export * from './schema/categories'
export * from './schema/tags'
export * from './schema/interactions'
export * from './schema/ingestion'

// DB client
const connectionString = process.env.DATABASE_URL!

const client = postgres(connectionString, { prepare: false })
export const db = drizzle(client)
