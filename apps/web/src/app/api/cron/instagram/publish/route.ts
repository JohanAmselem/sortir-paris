import { revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/instagram/cron-auth'
import { publishDue } from '@/lib/instagram/pipeline'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/cron/instagram/publish — publishes the drafts whose time has come
 * (blocked posts are never published) and renews the access token when it
 * expires within 10 days. Bearer CRON_SECRET.
 *   ?dry=1   what would be published, without calling Instagram or writing
 * Called every 30 minutes by GitHub Actions (.github/workflows/instagram.yml).
 */
export async function POST(request: NextRequest) {
  if (!cronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dryRun = request.nextUrl.searchParams.get('dry') === '1'
  try {
    const result = await publishDue(new Date(), { dryRun })
    console.warn('[cron/instagram/publish]', JSON.stringify(result))
    // The link-in-bio page (/instagram) lists the published posts.
    if (result.ok && result.posts.some((p) => p.result === 'published')) revalidateTag('instagram')
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[cron/instagram/publish] failed', err)
    return NextResponse.json({ ok: false, error: 'Instagram publish failed' }, { status: 500 })
  }
}

// Vercel Cron calls with GET and the same Bearer CRON_SECRET.
export const GET = POST
