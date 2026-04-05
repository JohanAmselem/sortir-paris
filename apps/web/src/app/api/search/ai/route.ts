import { NextRequest, NextResponse } from 'next/server'
import { aiSearch } from '@/lib/ai-search'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query } = body

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return NextResponse.json(
        { error: 'La requête doit contenir au moins 2 caractères.' },
        { status: 400 }
      )
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'La recherche IA n\'est pas configurée.' },
        { status: 503 }
      )
    }

    const result = await aiSearch(query.trim())

    return NextResponse.json({
      success: true,
      query: query.trim(),
      intent: {
        category: result.intent.category,
        dateFilter: result.intent.dateFilter,
        isFree: result.intent.isFree,
        arrondissements: result.intent.arrondissements,
        keywords: result.intent.keywords,
        expandedKeywords: result.intent.expandedKeywords,
        ambiance: result.intent.ambiance,
        audience: result.intent.audience,
        intentSummary: result.intent.intentSummary,
        isVague: result.intent.isVague,
        alternativeInterpretations: result.intent.alternativeInterpretations,
        suggestedQueries: result.intent.suggestedQueries,
      },
      data: result.events.map((item) => ({
        id: item.event.id,
        title: item.event.title,
        slug: item.event.slug,
        shortDesc: item.event.shortDesc,
        imageUrl: item.event.imageUrl,
        startDate: item.event.startDate,
        endDate: item.event.endDate,
        priceMin: item.event.priceMin,
        priceMax: item.event.priceMax,
        isFree: item.event.isFree,
        relevanceReason: item.relevanceReason,
        relevanceScore: item.relevanceScore,
        category: item.category
          ? { name: item.category.name, slug: item.category.slug, icon: item.category.icon }
          : null,
        venue: item.venue
          ? { name: item.venue.name, arrondissement: item.venue.arrondissement }
          : null,
      })),
      alternatives: result.alternatives.map((item) => ({
        id: item.event.id,
        title: item.event.title,
        slug: item.event.slug,
        shortDesc: item.event.shortDesc,
        imageUrl: item.event.imageUrl,
        startDate: item.event.startDate,
        isFree: item.event.isFree,
        category: item.category
          ? { name: item.category.name, slug: item.category.slug, icon: item.category.icon }
          : null,
        venue: item.venue
          ? { name: item.venue.name, arrondissement: item.venue.arrondissement }
          : null,
      })),
      total: result.totalFound,
      searchStrategy: result.searchStrategy,
    })
  } catch (error) {
    console.error('[AI Search API] Error:', error)

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Format de requête invalide.' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Erreur lors de la recherche. Veuillez réessayer.' },
      { status: 500 }
    )
  }
}
