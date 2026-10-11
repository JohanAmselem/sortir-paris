import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { ALERT_KINDS, type AlertKind } from '@/lib/alerts'
import { runAlerts } from '@/lib/alerts-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * POST /api/cron/alerts — artist alerts (new dates, ticket openings, reminders
 * the day before a « J'y vais »). Bearer CRON_SECRET.
 *   ?only=reminder|new_date|on_sale (comma-separated) — restrict the kinds
 *   ?dry=1 — what would be sent, without sending or writing anything
 * Called by GitHub Actions after each scrape and every morning (reminders).
 */
export async function POST(request: NextRequest) {
  if (!authorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const params = request.nextUrl.searchParams
  const dryRun = params.get('dry') === '1'
  const only = params.get('only')
  let kinds: AlertKind[] = ALERT_KINDS
  if (only) {
    kinds = only.split(',').map((s) => s.trim()) as AlertKind[]
    if (!kinds.length || kinds.some((k) => !ALERT_KINDS.includes(k))) {
      return NextResponse.json({ error: `only: ${ALERT_KINDS.join(', ')}` }, { status: 400 })
    }
  }
  try {
    const stats = await runAlerts({ dryRun, kinds })
    console.warn('[cron/alerts]', JSON.stringify({ ...stats, preview: stats.preview?.length }))
    return NextResponse.json(stats, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[cron/alerts] failed', err)
    return NextResponse.json({ ok: false, error: 'Alerts run failed' }, { status: 500 })
  }
}
