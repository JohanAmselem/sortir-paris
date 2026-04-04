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

  // 1. Fetch all active events with venue + category info
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
  const allTagNames = new Set<string>()
  const eventTagMap = new Map<string, string[]>()

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

    eventTagMap.set(event.id, tagNames)
    for (const name of tagNames) {
      allTagNames.add(name)
    }
  }

  console.log(`Generated ${allTagNames.size} unique tags`)

  // 3. Upsert all tags into the tags table
  const tagNameToId = new Map<string, string>()
  const tagBatch = Array.from(allTagNames).map(name => ({
    name,
    slug: slugify(name),
  }))

  // Process in batches of 100
  const TAG_BATCH_SIZE = 100
  for (let i = 0; i < tagBatch.length; i += TAG_BATCH_SIZE) {
    const batch = tagBatch.slice(i, i + TAG_BATCH_SIZE)

    for (const tag of batch) {
      const result = await sql`
        INSERT INTO tags (name, slug)
        VALUES (${tag.name}, ${tag.slug})
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
        RETURNING id, name
      `
      if (result.length > 0) {
        tagNameToId.set(tag.name, result[0].id)
      }
    }

    console.log(`Upserted tags: ${Math.min(i + TAG_BATCH_SIZE, tagBatch.length)}/${tagBatch.length}`)
  }

  // 4. Clear existing event_tags and repopulate
  console.log('Clearing existing event_tags...')
  await sql`DELETE FROM event_tags`

  // 5. Insert event_tags in batches
  let totalLinks = 0
  const EVENT_BATCH_SIZE = 50

  const eventIds = Array.from(eventTagMap.keys())
  for (let i = 0; i < eventIds.length; i += EVENT_BATCH_SIZE) {
    const batchIds = eventIds.slice(i, i + EVENT_BATCH_SIZE)

    for (const eventId of batchIds) {
      const tagNames = eventTagMap.get(eventId) || []
      for (const tagName of tagNames) {
        const tagId = tagNameToId.get(tagName)
        if (tagId) {
          try {
            await sql`
              INSERT INTO event_tags (event_id, tag_id)
              VALUES (${eventId}, ${tagId})
              ON CONFLICT DO NOTHING
            `
            totalLinks++
          } catch {
            // Skip duplicates
          }
        }
      }
    }

    console.log(`Linked events: ${Math.min(i + EVENT_BATCH_SIZE, eventIds.length)}/${eventIds.length} (${totalLinks} links)`)
  }

  // 6. Update the keywords column on each event for full-text search fallback
  console.log('\nUpdating keywords column on events...')
  let keywordUpdates = 0
  for (let i = 0; i < events.length; i += EVENT_BATCH_SIZE) {
    const batch = events.slice(i, i + EVENT_BATCH_SIZE)

    for (const event of batch) {
      const keywords = extractKeywords({
        title: event.title,
        description: event.description,
        shortDesc: event.shortDesc,
        categorySlug: event.categorySlug,
        categoryName: event.categoryName,
        venueName: event.venueName,
        venueAddress: event.venueAddress,
      })

      const keywordsStr = keywordsToSearchString(keywords)
      await sql`
        UPDATE events SET keywords = ${keywordsStr}
        WHERE id = ${event.id}
      `
      keywordUpdates++
    }

    console.log(`Updated keywords: ${Math.min(i + EVENT_BATCH_SIZE, events.length)}/${events.length}`)
  }

  console.log(`\nDone! Created ${tagNameToId.size} tags, ${totalLinks} event-tag links, updated ${keywordUpdates} event keywords.`)
  console.log(`Average tags per event: ${(totalLinks / events.length).toFixed(1)}`)

  await sql.end()
}

generateTags().catch((err) => {
  console.error('Tag generation failed:', err)
  process.exit(1)
})
