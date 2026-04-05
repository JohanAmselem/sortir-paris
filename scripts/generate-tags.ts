/**
 * Auto-generate tags for all events and populate event_tags table.
 * Usage: pnpm tsx scripts/generate-tags.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../.env.local') })

import { getTagCandidates, extractKeywords, keywordsToSearchString } from './lib/keyword-extractor'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function generateTags() {
  const { default: postgres } = await import('postgres')
  const databaseUrl = process.env.DATABASE_URL!

  console.log('Connecting to database...')
  const sql = postgres(databaseUrl, { prepare: false })

  // 1. Fetch all active events
  const events = await sql`
    SELECT
      e.id,
      e.title,
      e.short_desc AS "shortDesc",
      e.description,
      c.name AS "categoryName",
      c.slug AS "categorySlug",
      v.name AS "venueName",
      v.address AS "venueAddress"
    FROM events e
    LEFT JOIN categories c ON c.id = e.category_id
    LEFT JOIN venues v ON v.id = e.venue_id
    WHERE e.status = 'active'
  `

  console.log(`Found ${events.length} active events`)

  // 2. Generate tags for each event
  const allTagSlugs = new Map<string, string>() // slug -> name
  const eventTagMap = new Map<string, string[]>() // eventId -> tag slugs
  const eventKeywords = new Map<string, string>() // eventId -> keywords string

  for (const event of events) {
    const tagNames = getTagCandidates({
      title: event.title,
      description: event.description,
      shortDesc: event.shortDesc,
      categorySlug: event.categorySlug,
      categoryName: event.categoryName,
      venueName: event.venueName,
      venueAddress: event.venueAddress,
    })

    const slugs: string[] = []
    for (const name of tagNames) {
      const slug = slugify(name)
      if (slug.length >= 2) {
        allTagSlugs.set(slug, name)
        slugs.push(slug)
      }
    }
    eventTagMap.set(event.id, slugs)

    // Also generate keywords
    const keywords = extractKeywords({
      title: event.title,
      description: event.description,
      shortDesc: event.shortDesc,
      categorySlug: event.categorySlug,
      categoryName: event.categoryName,
      venueName: event.venueName,
      venueAddress: event.venueAddress,
    })
    eventKeywords.set(event.id, keywordsToSearchString(keywords))
  }

  console.log(`Generated ${allTagSlugs.size} unique tags`)

  // 3. Batch upsert all tags using VALUES list
  const tagEntries = Array.from(allTagSlugs.entries())
  const BATCH = 500
  const slugToId = new Map<string, string>()

  for (let i = 0; i < tagEntries.length; i += BATCH) {
    const batch = tagEntries.slice(i, i + BATCH)
    // Use individual upserts but in a transaction for speed
    await sql.begin(async (tx) => {
      for (const [slug, name] of batch) {
        const result = await tx`
          INSERT INTO tags (name, slug)
          VALUES (${name}, ${slug})
          ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
          RETURNING id, slug
        `
        if (result.length > 0) {
          slugToId.set(result[0].slug, result[0].id)
        }
      }
    })
    console.log(`Upserted tags: ${Math.min(i + BATCH, tagEntries.length)}/${tagEntries.length}`)
  }

  // 4. Clear existing event_tags
  console.log('Clearing existing event_tags...')
  await sql`DELETE FROM event_tags`

  // 5. Batch insert event_tags using raw SQL for speed
  let totalLinks = 0
  const eventIds = Array.from(eventTagMap.keys())
  const EVENT_BATCH = 200

  for (let i = 0; i < eventIds.length; i += EVENT_BATCH) {
    const batchIds = eventIds.slice(i, i + EVENT_BATCH)

    // Collect all (event_id, tag_id) pairs for this batch
    const pairs: Array<{ eventId: string; tagId: string }> = []
    for (const eventId of batchIds) {
      const tagSlugs = eventTagMap.get(eventId) || []
      for (const slug of tagSlugs) {
        const tagId = slugToId.get(slug)
        if (tagId) {
          pairs.push({ eventId, tagId })
        }
      }
    }

    if (pairs.length > 0) {
      // Insert in sub-batches of 1000 to avoid query size limits
      const SUB_BATCH = 1000
      for (let j = 0; j < pairs.length; j += SUB_BATCH) {
        const subBatch = pairs.slice(j, j + SUB_BATCH)
        const values = subBatch.map(p => sql`(${p.eventId}::uuid, ${p.tagId}::uuid)`)

        await sql`
          INSERT INTO event_tags (event_id, tag_id)
          VALUES ${sql.unsafe(subBatch.map(p => `('${p.eventId}','${p.tagId}')`).join(','))}
          ON CONFLICT DO NOTHING
        `
        totalLinks += subBatch.length
      }
    }

    console.log(`Linked events: ${Math.min(i + EVENT_BATCH, eventIds.length)}/${eventIds.length} (${totalLinks} links)`)
  }

  // 6. Batch update keywords column
  console.log('\nUpdating keywords column on events...')
  const kwEntries = Array.from(eventKeywords.entries())
  for (let i = 0; i < kwEntries.length; i += EVENT_BATCH) {
    const batch = kwEntries.slice(i, i + EVENT_BATCH)

    await sql.begin(async (tx) => {
      for (const [eventId, kw] of batch) {
        await tx`UPDATE events SET keywords = ${kw} WHERE id = ${eventId}`
      }
    })

    console.log(`Updated keywords: ${Math.min(i + EVENT_BATCH, kwEntries.length)}/${kwEntries.length}`)
  }

  console.log(`\nDone! Created ${slugToId.size} tags, ${totalLinks} event-tag links.`)
  console.log(`Average tags per event: ${(totalLinks / events.length).toFixed(1)}`)

  await sql.end()
}

generateTags().catch((err) => {
  console.error('Tag generation failed:', err)
  process.exit(1)
})
