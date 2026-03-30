import { defineConfig } from 'drizzle-kit'
import { config } from 'dotenv'
import { resolve } from 'path'

// Charge le .env.local à la racine du monorepo
config({ path: resolve(__dirname, '../../.env.local') })

export default defineConfig({
  schema: './src/schema/*',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
