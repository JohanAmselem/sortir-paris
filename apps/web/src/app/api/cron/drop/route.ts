import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { runDropPush } from '@/lib/drop-push'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * POST /api/cron/drop — notification du Drop du lundi dans l'appli. Bearer CRON_SECRET.
 *   ?dry=1 — combien de membres seraient notifiés, sans rien envoyer ni écrire.
 * Vercel Cron : toutes les 10 minutes le lundi de 08:00 à 09:50 UTC (vercel.json).
 * Chaque passage est sans danger : les membres sont réservés avant l'envoi.
 */
export async function POST(request: NextRequest) {
  if (!authorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const stats = await runDropPush({ dryRun: request.nextUrl.searchParams.get('dry') === '1' })
    console.warn('[cron/drop]', JSON.stringify(stats))
    return NextResponse.json(stats, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[cron/drop]', err)
    return NextResponse.json({ ok: false, error: 'Échec de l’envoi du Drop.' }, { status: 500 })
  }
}

export const GET = POST
