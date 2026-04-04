/**
 * Sync all active events from Supabase → Meilisearch
 * Usage: pnpm tsx scripts/sync-meilisearch.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../.env.local') })

import { extractKeywords, keywordsToSearchString } from './lib/keyword-extractor'

async function sync() {
  const { MeiliSearch } = await import('meilisearch')
  const { default: postgres } = await import('postgres')

  const meiliHost = process.env.MEILISEARCH_HOST!
  const meiliKey = process.env.MEILISEARCH_API_KEY!
  const databaseUrl = process.env.DATABASE_URL!

  console.log(`Connecting to Meilisearch at ${meiliHost}...`)
  const meili = new MeiliSearch({ host: meiliHost, apiKey: meiliKey })

  console.log('Connecting to database...')
  const sql = postgres(databaseUrl, { prepare: false })

  // 1. Fetch all active events with venue + category info
  const events = await sql`
    SELECT
      e.id,
      e.title,
      e.slug,
      e.short_desc AS "shortDesc",
      e.description,
      e.image_url AS "imageUrl",
      e.start_date AS "startDate",
      e.end_date AS "endDate",
      e.price_min AS "priceMin",
      e.price_max AS "priceMax",
      e.is_free AS "isFree",
      e.booking_url AS "bookingUrl",
      e.save_count AS "saveCount",
      e.view_count AS "viewCount",
      e.quality_score AS "qualityScore",
      e.source,
      e.source_url AS "sourceUrl",
      c.name AS "categoryName",
      c.slug AS "categorySlug",
      c.icon AS "categoryIcon",
      v.name AS "venueName",
      v.address AS "venueAddress",
      v.arrondissement,
      v.lat,
      v.lng,
      v.city
    FROM events e
    LEFT JOIN categories c ON c.id = e.category_id
    LEFT JOIN venues v ON v.id = e.venue_id
    WHERE e.status = 'active'
    ORDER BY e.start_date ASC
  `

  console.log(`Found ${events.length} active events`)

  // 1b. Fetch tags from event_tags table
  const eventTagRows = await sql`
    SELECT et.event_id AS "eventId", t.name AS "tagName"
    FROM event_tags et
    INNER JOIN tags t ON t.id = et.tag_id
  `
  const eventTagsMap = new Map<string, string[]>()
  for (const row of eventTagRows) {
    const existing = eventTagsMap.get(row.eventId) || []
    existing.push(row.tagName)
    eventTagsMap.set(row.eventId, existing)
  }
  console.log(`Loaded tags for ${eventTagsMap.size} events`)

  // 2. Transform for Meilisearch — with auto-generated keywords
  const documents = events.map((e) => {
    // Auto-generate keywords from event content
    const keywords = extractKeywords({
      title: e.title,
      description: e.description,
      shortDesc: e.shortDesc,
      categorySlug: e.categorySlug,
      categoryName: e.categoryName,
      venueName: e.venueName,
      venueAddress: e.venueAddress,
    })

    // Get tags from DB (if generated)
    const dbTags = eventTagsMap.get(e.id) || []

    return {
      id: e.id,
      title: e.title,
      slug: e.slug,
      shortDesc: e.shortDesc,
      description: e.description?.substring(0, 500) || null, // truncate for index size
      imageUrl: e.imageUrl,
      startDate: Math.floor(new Date(e.startDate).getTime() / 1000), // unix timestamp for filtering
      startDateISO: new Date(e.startDate).toISOString(),
      endDate: e.endDate ? Math.floor(new Date(e.endDate).getTime() / 1000) : null,
      endDateISO: e.endDate ? new Date(e.endDate).toISOString() : null,
      priceMin: e.priceMin ?? 0,
      priceMax: e.priceMax ?? 0,
      isFree: e.isFree ?? false,
      bookingUrl: e.bookingUrl,
      saveCount: e.saveCount ?? 0,
      viewCount: e.viewCount ?? 0,
      qualityScore: e.qualityScore ?? 0,
      source: e.source,
      sourceUrl: e.sourceUrl,
      category: e.categoryName,
      categorySlug: e.categorySlug,
      categoryIcon: e.categoryIcon,
      venueName: e.venueName,
      venueAddress: e.venueAddress,
      arrondissement: e.arrondissement,
      city: e.city,
      tags: dbTags,
      keywords: keywordsToSearchString(keywords), // rich auto-generated keywords for search
      _geo: e.lat && e.lng ? { lat: e.lat, lng: e.lng } : undefined,
    }
  })

  // 3. Configure index settings
  console.log('Configuring index settings...')
  const index = meili.index('events')

  await index.updateSettings({
    searchableAttributes: [
      'title',         // highest priority
      'keywords',      // auto-generated rich keywords
      'tags',          // DB tags
      'venueName',
      'shortDesc',
      'description',
      'category',
    ],
    filterableAttributes: [
      'categorySlug',
      'arrondissement',
      'isFree',
      'priceMin',
      'priceMax',
      'startDate',
      'tags',
      'city',
      '_geo',
    ],
    sortableAttributes: ['startDate', 'saveCount', 'qualityScore'],
    rankingRules: [
      'words',
      'typo',
      'proximity',
      'attribute',
      'sort',
      'exactness',
    ],
    typoTolerance: {
      enabled: true,
      minWordSizeForTypos: { oneTypo: 3, twoTypos: 6 },
    },
    synonyms: {
      'concert': ['live', 'show', 'musique', 'spectacle musical'],
      'expo': ['exposition', 'galerie', 'musée'],
      'gratuit': ['free', 'entrée libre', 'bon plan'],
      'theatre': ['théâtre', 'pièce', 'représentation'],
      'danse': ['ballet', 'chorégraphie', 'danseur'],
      'cinema': ['cinéma', 'film', 'projection'],
      'soirée': ['party', 'fête', 'clubbing', 'nuit'],
      'enfants': ['famille', 'jeune public', 'kids'],
      'classique': ['orchestre', 'symphonique', 'opéra'],
      'electro': ['techno', 'house', 'electronic'],
      'hip-hop': ['rap', 'hip hop', 'trap'],
      'jazz': ['swing', 'manouche', 'blues'],
      'contemporain': ['moderne', 'actuel'],
      'stand-up': ['humour', 'one man show', 'comédie'],
    },
    faceting: { maxValuesPerFacet: 100 },
    pagination: { maxTotalHits: 5000 },
    displayedAttributes: ['*'],
  })

  // 4. Add documents in batches of 500
  const BATCH_SIZE = 500
  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents.slice(i, i + BATCH_SIZE)
    const task = await index.addDocuments(batch, { primaryKey: 'id' })
    console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: sent ${batch.length} docs (task ${task.taskUid})`)
  }

  // 5. Wait for indexing to complete
  console.log('Waiting for indexing to complete...')
  await new Promise((resolve) => setTimeout(resolve, 3000))

  const stats = await index.getStats()
  console.log(`\nDone! Index "events" now has ${stats.numberOfDocuments} documents.`)

  // 6. Create a search-only API key
  console.log('\nCreating search-only API key...')
  try {
    const searchKey = await meili.createKey({
      description: 'Public search key (read-only)',
      actions: ['search'],
      indexes: ['events'],
      expiresAt: null,
    })
    console.log(`\nSearch API Key: ${searchKey.key}`)
    console.log(`\n→ Add this to your .env.local as:`)
    console.log(`  NEXT_PUBLIC_MEILISEARCH_SEARCH_KEY=${searchKey.key}`)
  } catch (err: unknown) {
    const error = err as { message?: string }
    if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
      console.log('Search key already exists, skipping creation.')
    } else {
      console.log('Could not create search key (may already exist):', error.message)
    }
  }

  await sql.end()
  console.log('\nSync complete!')
}

sync().catch((err) => {
  console.error('Sync failed:', err)
  process.exit(1)
})
