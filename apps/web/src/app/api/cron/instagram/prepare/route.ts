import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/instagram/cron-auth'
import { loadCredentials } from '@/lib/instagram/data'
import { NOT_CONNECTED, prepare } from '@/lib/instagram/pipeline'
import { parseISODate } from '@/lib/instagram/schedule'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/cron/instagram/prepare — drafts for tomorrow's Instagram posts
 * (« Demain à Paris », stories by theme, plus « Ta semaine » on Mondays and
 * « Ton week-end » on Thursdays), previewed in /admin/instagram. Bearer CRON_SECRET.
 *   ?dry=1             what would be prepared, without writing (no photo check, no AI)
 *   ?date=YYYY-MM-DD   prepare that publication day only
 * Called every day by GitHub Actions (.github/workflows/instagram.yml).
 */
export async function POST(request: NextRequest) {
  if (!cronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const params = request.nextUrl.searchParams
  const dryRun = params.get('dry') === '1'
  const date = params.get('date') ?? undefined
  if (date && !parseISODate(date)) return NextResponse.json({ error: 'date: YYYY-MM-DD' }, { status: 400 })
  try {
    // A dry run works without an account (to check the selection before connecting).
    if (!dryRun && !(await loadCredentials())) {
      return NextResponse.json({ ok: false, error: NOT_CONNECTED }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const result = await prepare(new Date(), { dryRun, date })
    console.warn('[cron/instagram/prepare]', JSON.stringify(result.posts.map((p) => [p.kind, p.theme, p.forDate, p.result, p.events])))
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[cron/instagram/prepare] failed', err)
    return NextResponse.json({ ok: false, error: 'Instagram prepare failed' }, { status: 500 })
  }
}

// Vercel Cron calls with GET and the same Bearer CRON_SECRET.
export const GET = POST
