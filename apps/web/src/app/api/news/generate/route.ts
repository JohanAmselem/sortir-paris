import { NextRequest, NextResponse } from 'next/server'
import { generateDailyArticles, generateArticle, saveArticles } from '@/lib/article-generator'

// POST /api/news/generate — Generate articles
// Protected by a simple API key check
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expectedKey = process.env.ARTICLE_GEN_SECRET ?? process.env.CRON_SECRET

  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const count = Math.min(body.count ?? 10, 15)
    const type = body.type // optional: generate specific type

    let generated

    if (type) {
      // Generate a single article of a specific type
      const article = await generateArticle({ type, topic: body.topic })
      generated = article ? [article] : []
    } else {
      // Generate daily batch
      generated = await generateDailyArticles(count)
    }

    if (generated.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No articles generated — check ANTHROPIC_API_KEY and event data',
        generated: 0,
      })
    }

    const saved = await saveArticles(generated)

    return NextResponse.json({
      success: true,
      generated: generated.length,
      saved,
      articles: generated.map((a) => ({ title: a.title, type: a.type, slug: a.slug })),
    })
  } catch (error) {
    console.error('[API Generate] Error:', error)
    return NextResponse.json(
      { error: 'Generation failed', details: String(error) },
      { status: 500 }
    )
  }
}
