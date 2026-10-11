import { NextRequest, NextResponse } from 'next/server'
import { limit } from '@/app/club/_lib/api'
import { unsubscribeByToken } from '@/lib/alerts-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/alerts/unsubscribe?token=… — one-click unsubscribe (RFC 8058,
 * List-Unsubscribe-Post header of the alert e-mails). Disables alert e-mails.
 * GET (a person opening the link) goes to the confirmation page instead:
 * mail scanners prefetch links and must not unsubscribe anyone.
 */
export async function POST(request: NextRequest) {
  const limited = limit(request, 'alerts-unsubscribe', 20, 60_000)
  if (limited) return limited
  const token = (request.nextUrl.searchParams.get('token') ?? '').slice(0, 200)
  try {
    const ok = await unsubscribeByToken(token)
    return NextResponse.json({ ok }, { status: ok ? 200 : 404, headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[api/alerts/unsubscribe] failed', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? ''
  return NextResponse.redirect(new URL(`/alertes/desinscription?token=${encodeURIComponent(token.slice(0, 200))}`, request.url))
}
