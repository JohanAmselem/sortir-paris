import { NextRequest, NextResponse } from 'next/server'
import { clientIp, rateLimit } from '@/lib/rate-limit'

/**
 * POST /api/csp-report — receives Content-Security-Policy-Report-Only violations
 * and logs a compact line (Vercel logs), to tighten the policy before enforcing it.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`csp:${clientIp(req.headers)}`, 20, 60_000).ok) return new NextResponse(null, { status: 204 })
  try {
    const body = (await req.json()) as { 'csp-report'?: Record<string, unknown> }
    const r = body['csp-report'] ?? {}
    console.warn('[csp]', JSON.stringify({ d: r['violated-directive'], b: r['blocked-uri'], p: r['document-uri'] }).slice(0, 500))
  } catch {
    // Malformed report: ignore.
  }
  return new NextResponse(null, { status: 204 })
}
