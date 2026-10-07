import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300

function authorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}
import { generateDailyArticles, saveArticles } from '@/lib/article-generator'

/**
 * Vercel Cron endpoint for daily article generation.
 *
 * In vercel.json, add:
 * {
 *   "crons": [
 *     { "path": "/api/cron/daily-articles", "schedule": "0 7 * * *" }
 *   ]
 * }
 *
 * This runs every day at 7am UTC (9am Paris time).
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets this automatically for cron jobs)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!authorized(authHeader, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.warn('[Cron] Starting daily article generation...')

    const generated = await generateDailyArticles(3)

    if (generated.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No articles generated',
      })
    }

    const saved = await saveArticles(generated)

    console.warn(`[Cron] Generated ${generated.length}, saved ${saved} articles`)

    return NextResponse.json({
      success: true,
      generated: generated.length,
      saved,
      articles: generated.map((a) => ({ title: a.title, type: a.type })),
    })
  } catch (error) {
    console.error('[Cron] Error:', error)
    return NextResponse.json(
      { error: 'Generation failed' },
      { status: 500 }
    )
  }
}
