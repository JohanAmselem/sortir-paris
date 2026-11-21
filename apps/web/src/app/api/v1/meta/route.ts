import { NextResponse } from 'next/server'
import { ARRONDISSEMENTS, CATEGORIES, INTENTS } from '@/lib/events/taxonomy'
import { COLLECTIONS } from '@/lib/collections'
import { buildEventParams } from '@/lib/events/params'
import type { MetaResponse } from '@/lib/api-v1/contract'

/** GET /api/v1/meta — catégories, ambiances, collections et arrondissements (données stables). */
export function GET() {
  const body = {
    categories: CATEGORIES.map((c) => ({ slug: c.slug, name: c.plural })),
    intents: INTENTS.map((i) => ({ slug: i.slug, label: i.label })),
    collections: COLLECTIONS.map((c) => ({ slug: c.slug, title: c.title, tagline: c.tagline, params: buildEventParams(c.query).toString() })),
    arrondissements: ARRONDISSEMENTS,
  } satisfies MetaResponse
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
}
