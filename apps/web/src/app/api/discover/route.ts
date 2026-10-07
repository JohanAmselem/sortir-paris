import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { recommend, intentToQuery } from '@/lib/ai/recommend'
import { parseOutingRequest, MAX_QUERY_LENGTH } from '@/lib/ai/intent'
import { CATEGORY_BY_SLUG, INTENT_BY_SLUG, normalizeArrondissement } from '@/lib/events/taxonomy'
import { WINDOW_KEYS } from '@/lib/paris-time'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import type { EventQuery } from '@/lib/events/types'

const list = (allowed: Record<string, unknown>) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter((x) => x in allowed).slice(0, 4) : []))

const GetSchema = z.object({
  when: z.string().optional().refine((v) => !v || (WINDOW_KEYS as string[]).includes(v) || /^\d{4}-\d{2}-\d{2}$/.test(v)),
  categories: list(CATEGORY_BY_SLUG),
  intents: list(INTENT_BY_SLUG),
  arr: z.string().optional().transform((v) => (v ? v.split(',').map((a) => normalizeArrondissement(a)).filter((a): a is string => !!a) : [])),
  free: z.enum(['true', 'false']).optional(),
  maxPrice: z.coerce.number().min(0).max(500).optional(),
  lat: z.coerce.number().min(48.5).max(49.2).optional(),
  lng: z.coerce.number().min(1.9).max(2.9).optional(),
  radius: z.coerce.number().min(0.3).max(15).optional(),
  limit: z.coerce.number().int().min(1).max(12).optional(),
})

const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' }

/** GET /api/discover — chips-based discovery (cacheable at the CDN). */
export async function GET(req: NextRequest) {
  const parsed = GetSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
  const p = parsed.data
  const near = p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng, radiusKm: p.radius ?? 2.5 } : null
  const query: EventQuery = {
    when: p.when ?? 'tonight',
    categories: p.categories,
    intents: p.intents,
    arrondissements: p.arr,
    free: p.free === 'true',
    maxPrice: p.maxPrice ?? null,
    near,
  }
  const result = await recommend(query, p.limit ?? 6)
  return NextResponse.json(result, { headers: near ? { 'Cache-Control': 'private, max-age=60' } : CACHE_HEADERS })
}

const PostSchema = z.object({
  q: z.string().trim().min(2).max(MAX_QUERY_LENGTH),
  lat: z.number().min(48.5).max(49.2).optional(),
  lng: z.number().min(1.9).max(2.9).optional(),
  limit: z.number().int().min(1).max(12).optional(),
})

/** POST /api/discover — free-text request ("je veux sortir…"). Rate limited: it may call the LLM. */
export async function POST(req: NextRequest) {
  const limit = rateLimit(`discover:${clientIp(req.headers)}`, 12, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Trop de recherches d’un coup. Réessaie dans un instant.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    )
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }
  const parsed = PostSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Écris au moins deux lettres.' }, { status: 400 })

  const { q, lat, lng } = parsed.data
  const { intent, source } = await parseOutingRequest(q)
  const near = lat != null && lng != null ? { lat, lng } : null
  const result = await recommend(intentToQuery(intent, near), parsed.data.limit ?? 6)
  return NextResponse.json({ ...result, intent, source, needsLocation: intent.nearMe && !near })
}
