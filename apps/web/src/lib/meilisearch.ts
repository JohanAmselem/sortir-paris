import { MeiliSearch } from 'meilisearch'

// Server-side client (admin key — full access)
// Meilisearch is optional — search falls back to DB if not configured
const meiliHost = process.env.MEILISEARCH_HOST || ''
const meiliKey = process.env.MEILISEARCH_API_KEY || ''

export const isMeilisearchEnabled = meiliHost.length > 0 && meiliHost !== 'http://localhost:7700'

export const meiliAdmin = isMeilisearchEnabled
  ? new MeiliSearch({ host: meiliHost, apiKey: meiliKey })
  : null

// Index name
export const EVENTS_INDEX = 'events'

// Setup index settings (run once on deploy)
export async function setupMeilisearchIndex() {
  if (!meiliAdmin) {
    console.log('Meilisearch not configured — skipping index setup')
    return
  }
  const index = meiliAdmin.index(EVENTS_INDEX)

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
      'category',
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
    synonyms: {
      concert: ['live', 'show', 'musique', 'spectacle musical'],
      expo: ['exposition', 'galerie', 'musée'],
      gratuit: ['free', 'entrée libre', 'bon plan'],
      theatre: ['théâtre', 'pièce', 'représentation'],
      danse: ['ballet', 'chorégraphie', 'danseur'],
      cinema: ['cinéma', 'film', 'projection'],
      soirée: ['party', 'fête', 'clubbing', 'nuit'],
      enfants: ['famille', 'jeune public', 'kids'],
      classique: ['orchestre', 'symphonique', 'opéra'],
      electro: ['techno', 'house', 'electronic'],
      'hip-hop': ['rap', 'hip hop', 'trap'],
      jazz: ['swing', 'manouche', 'blues'],
      contemporain: ['moderne', 'actuel'],
      'stand-up': ['humour', 'one man show', 'comédie'],
    },
    typoTolerance: {
      enabled: true,
      minWordSizeForTypos: { oneTypo: 3, twoTypos: 6 },
    },
    faceting: { maxValuesPerFacet: 100 },
    pagination: { maxTotalHits: 5000 },
  })

  console.log('Meilisearch index configured')
}
