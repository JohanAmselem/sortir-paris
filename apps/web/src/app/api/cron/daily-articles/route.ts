import { NextRequest, NextResponse } from 'next/server'
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

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[Cron] Starting daily article generation...')

    const generated = await generateDailyArticles(10)

    if (generated.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No articles generated',
      })
    }

    const saved = await saveArticles(generated)

    console.log(`[Cron] Generated ${generated.length}, saved ${saved} articles`)

    return NextResponse.json({
      success: true,
      generated: generated.length,
      saved,
      articles: generated.map((a) => ({ title: a.title, type: a.type })),
    })
  } catch (error) {
    console.error('[Cron] Error:', error)
    return NextResponse.json(
      { error: 'Generation failed', details: String(error) },
      { status: 500 }
    )
  }
}
