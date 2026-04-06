#!/usr/bin/env npx tsx
/**
 * Daily Article Generator
 *
 * Generates 10 culturally relevant articles per day using AI.
 * Run via cron or manually:
 *   npx tsx scripts/generate-daily-articles.ts
 *
 * Or via API (for Vercel Cron):
 *   POST /api/news/generate
 *   Authorization: Bearer $ARTICLE_GEN_SECRET
 *
 * Environment:
 *   DATABASE_URL — Supabase connection
 *   ANTHROPIC_API_KEY — Claude API key
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load env
config({ path: resolve(__dirname, '../../../.env.local') })

async function main() {
  console.log('🗞️  Starting daily article generation...')
  console.log(`📅  ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`)
  console.log('')

  // Dynamic import to ensure env is loaded first
  const { generateDailyArticles, saveArticles } = await import('../src/lib/article-generator')

  const count = parseInt(process.env.DAILY_ARTICLE_COUNT ?? '10')

  console.log(`📝  Generating ${count} articles...`)
  console.log('')

  const generated = await generateDailyArticles(count)

  console.log(`✅  Generated ${generated.length} articles:`)
  for (const article of generated) {
    console.log(`   ${article.type.padEnd(12)} → ${article.title}`)
  }

  if (generated.length === 0) {
    console.log('⚠️  No articles generated. Check:')
    console.log('   - ANTHROPIC_API_KEY is set')
    console.log('   - There are upcoming events in the database')
    process.exit(1)
  }

  console.log('')
  console.log('💾  Saving to database...')

  const saved = await saveArticles(generated)

  console.log(`✅  Saved ${saved}/${generated.length} articles to database`)
  console.log('')
  console.log('🎉  Done!')

  process.exit(0)
}

main().catch((error) => {
  console.error('❌  Fatal error:', error)
  process.exit(1)
})
