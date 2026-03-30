import { MeiliSearch } from 'meilisearch'

// Server-side client (admin key — full access)
export const meiliAdmin = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST!,
  apiKey: process.env.MEILISEARCH_API_KEY!,
})

// Index name
export const EVENTS_INDEX = 'events'

// Setup index settings (run once on deploy)
export async function setupMeilisearchIndex() {
  const index = meiliAdmin.index(EVENTS_INDEX)

  await index.updateSettings({
    searchableAttributes: ['title', 'venueName', 'shortDesc', 'description', 'tags'],
    filterableAttributes: [
      'category',
      'categorySlug',
      'arrondissement',
      'isFree',
      'priceMin',
      'priceMax',
      'startDate',
      'ambiances',
      'tags',
    ],
    sortableAttributes: ['startDate', 'saveCount', 'qualityScore'],
    rankingRules: [
      'words',
      'typo',
      'proximity',
      'attribute',
      'sort',
      'exactness',
      'quality_score:desc',
    ],
    typoTolerance: {
      enabled: true,
      minWordSizeForTypos: { oneTypo: 3, twoTypos: 6 },
    },
    faceting: { maxValuesPerFacet: 100 },
    pagination: { maxTotalHits: 1000 },
  })

  console.log('Meilisearch index configured')
}
