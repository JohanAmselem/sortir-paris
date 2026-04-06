import { NextRequest, NextResponse } from 'next/server'
import { db, articles } from '@sortir/db'
import { eq, and, desc, sql } from 'drizzle-orm'

// GET /api/news — List articles with pagination & filters
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50)
  const offset = (page - 1) * limit
  const type = searchParams.get('type')

  const conditions = [eq(articles.status, 'published')]

  if (type && ['actualite', 'selection', 'focus', 'tendance', 'interview'].includes(type)) {
    conditions.push(eq(articles.type, type as 'actualite' | 'selection' | 'focus' | 'tendance' | 'interview'))
  }

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(articles)
      .where(and(...conditions))
      .orderBy(desc(articles.priority), desc(articles.publishedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(articles)
      .where(and(...conditions)),
  ])

  const total = Number(countResult[0].count)

  return NextResponse.json({
    data: results,
    total,
    page,
    limit,
    hasMore: offset + limit < total,
  })
}
