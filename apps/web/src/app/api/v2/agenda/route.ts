import { NextRequest, NextResponse } from 'next/server'
import { getAgenda } from '@/lib/agenda'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import type { AgendaResponse } from '@/lib/api-v2/contract'

/**
 * GET /api/v2/agenda — l'Agenda de l'appli 2.0 (et du site) : tout ce qui vient,
 * trié par date, avec curseur (aucune limite de pages), compteurs par mois et par
 * jour, expos à part, artistes et lieux quand on a tapé un texte.
 * Paramètres : ceux des listes (lib/events/params.ts) + cursor, offset, limit.
 */
export async function GET(request: NextRequest) {
  const rl = rateLimit(`agenda:${clientIp(request.headers)}`, 120, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Trop de requêtes, réessaie dans un instant.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } })
  }
  const sp = request.nextUrl.searchParams
  try {
    const body = (await getAgenda(sp, { limit: Number(sp.get('limit')) || undefined, offset: Number(sp.get('offset')) || 0 })) satisfies AgendaResponse
    const near = sp.has('lat') && sp.has('lng')
    return NextResponse.json(body, {
      headers: near ? { 'Cache-Control': 'private, max-age=60' } : { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' },
    })
  } catch (err) {
    console.error('[api/v2/agenda]', err)
    return NextResponse.json({ error: 'Impossible de charger l’agenda.' }, { status: 503 })
  }
}
