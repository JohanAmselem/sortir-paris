/**
 * AI Article Generator for Paname Club
 *
 * Generates culturally relevant articles about Paris events, trends, and venues.
 * Uses upcoming events from DB as source material for authentic, useful content.
 */

import Anthropic from '@anthropic-ai/sdk'
import { db, events, venues, categories, articles } from '@sortir/db'
import { eq, and, gte, lte, desc, count } from 'drizzle-orm'

// ─── Types ───

interface ArticleInput {
  type: 'actualite' | 'selection' | 'focus' | 'tendance' | 'interview'
  topic?: string
  eventContext?: EventContext[]
}

interface EventContext {
  title: string
  category: string
  venue: string
  date: string
  isFree: boolean
  price: string
  slug: string
  id: string
}

interface GeneratedArticle {
  title: string
  slug: string
  excerpt: string
  content: string
  metaTitle: string
  metaDescription: string
  keywords: string
  tags: string
  type: string
  priority: number
  relatedEventIds: string
}

// ─── Helpers ───

function slugify(text: string, dateSuffix?: string): string {
  let slug = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)

  if (dateSuffix) {
    slug += `-${dateSuffix}`
  }
  return slug
}

function formatPrice(min: number, max: number, isFree: boolean): string {
  if (isFree) return 'Gratuit'
  if (!min && !max) return 'Tarif sur place'
  if (min === max) return `${(min / 100).toFixed(0)}€`
  return `${(min / 100).toFixed(0)}€ - ${(max / 100).toFixed(0)}€`
}

// ─── Data Fetchers ───

async function getUpcomingEvents(limit = 30): Promise<EventContext[]> {
  const now = new Date()
  const nextWeek = new Date(now)
  nextWeek.setDate(now.getDate() + 7)

  const results = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      startDate: events.startDate,
      isFree: events.isFree,
      priceMin: events.priceMin,
      priceMax: events.priceMax,
      qualityScore: events.qualityScore,
      categoryName: categories.name,
      venueName: venues.name,
    })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(and(
      eq(events.status, 'active'),
      gte(events.startDate, now),
      lte(events.startDate, nextWeek),
    ))
    .orderBy(desc(events.qualityScore))
    .limit(limit)

  return results.map((r) => ({
    title: r.title,
    category: r.categoryName ?? 'Événement',
    venue: r.venueName ?? 'Paris',
    date: r.startDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
    isFree: r.isFree,
    price: formatPrice(r.priceMin, r.priceMax, r.isFree),
    slug: r.slug,
    id: r.id,
  }))
}

async function getTrendingCategories(): Promise<string[]> {
  const now = new Date()
  const results = await db
    .select({ name: categories.name, eventCount: count(events.id) })
    .from(categories)
    .leftJoin(events, and(eq(events.categoryId, categories.id), gte(events.startDate, now)))
    .groupBy(categories.name)
    .orderBy(desc(count(events.id)))
    .limit(5)

  return results.map((r) => r.name)
}

// ─── Article Type Templates ───

const ARTICLE_PROMPTS: Record<string, (eventContext: EventContext[], extras: string) => string> = {
  actualite: (evts, extras) => `
Tu es un journaliste culturel parisien. Écris un article d'actualité culturelle à Paris.

ÉVÉNEMENTS À COUVRIR :
${evts.slice(0, 5).map((e) => `- ${e.title} (${e.category}) — ${e.venue}, ${e.date}, ${e.price}`).join('\n')}

${extras ? `ANGLE SUGGÉRÉ : ${extras}` : ''}

RÈGLES :
- Titre accrocheur, SEO-friendly, max 70 caractères
- Introduction en 2 phrases percutantes
- Contenu HTML structuré avec <h2>, <p>, <strong>, <blockquote>
- Informations pratiques : lieu, dates, prix
- Ton : moderne, accessible, inspirant, donne envie de sortir
- Mots-clés naturels : Paris, sortie, culture, événement
- 400-600 mots
- Rester factuel et centré sur Paris
`,

  selection: (evts, extras) => `
Tu es un éditeur culturel à Paris. Crée une sélection thématique d'événements.

ÉVÉNEMENTS DISPONIBLES :
${evts.slice(0, 10).map((e) => `- ${e.title} (${e.category}) — ${e.venue}, ${e.date}, ${e.price}`).join('\n')}

${extras ? `THÈME : ${extras}` : 'Choisis un thème pertinent (ex: "5 expos à ne pas rater", "Le meilleur du week-end", etc.)'}

RÈGLES :
- Titre avec chiffre (ex: "5 expos...", "Les 7 sorties...")
- Pour chaque événement sélectionné : un paragraphe engageant + infos pratiques
- Contenu HTML avec <h2> pour chaque pick, <p> pour les descriptions
- Ajoute ton éditorial : pourquoi on recommande, pour qui
- 500-800 mots
- Max 5-7 événements dans la sélection
`,

  focus: (evts, extras) => `
Tu es un critique culturel parisien. Écris un article "focus" sur un lieu ou un événement majeur.

CONTEXTE :
${evts.slice(0, 3).map((e) => `- ${e.title} — ${e.venue}, ${e.date}, ${e.price}`).join('\n')}

${extras ? `FOCUS SUR : ${extras}` : `Concentre-toi sur : ${evts[0]?.venue || 'un lieu culturel parisien'}`}

RÈGLES :
- Titre immersif et descriptif
- Raconter l'histoire/l'ambiance du lieu
- Contenu HTML riche : <h2>, <p>, <blockquote> pour les citations d'ambiance
- Informations pratiques complètes
- 400-600 mots
- Ton enthousiaste mais honnête
`,

  tendance: (evts, extras) => `
Tu es un analyste des tendances culturelles à Paris. Écris un article sur une tendance du moment.

ÉVÉNEMENTS RÉCENTS :
${evts.slice(0, 8).map((e) => `- ${e.title} (${e.category}) — ${e.venue}`).join('\n')}

${extras ? `TENDANCE : ${extras}` : 'Identifie une tendance dans ces événements (ex: retour du jazz, explosion de l\'art immersif, etc.)'}

RÈGLES :
- Titre captivant avec la tendance
- Analyse de la tendance + exemples concrets
- Contenu HTML : <h2>, <p>, <blockquote>, <strong>
- Inclure des événements concrets comme illustrations
- 400-600 mots
- Ton expert mais accessible
`,

  interview: (evts, extras) => `
Tu es journaliste culturel. Écris un article narratif / portrait sur un lieu ou un événement culturel parisien.

CONTEXTE :
${evts.slice(0, 3).map((e) => `- ${e.title} — ${e.venue}, ${e.date}`).join('\n')}

${extras ? `SUJET : ${extras}` : ''}

RÈGLES :
- Titre avec le nom du lieu/artiste
- Style narratif immersif
- Contenu HTML avec <h2>, <p>, <blockquote> pour l'ambiance
- Pas d'interview fictive — plutôt un portrait vivant du lieu/événement
- 400-600 mots
- Ton littéraire mais accessible
`,
}

// ─── Main Generation ───

export async function generateArticle(input: ArticleInput): Promise<GeneratedArticle | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn('[Article Generator] No ANTHROPIC_API_KEY')
    return null
  }

  const eventContext = input.eventContext ?? await getUpcomingEvents(30)
  if (eventContext.length === 0) {
    console.warn('[Article Generator] No upcoming events to write about')
    return null
  }

  const promptFn = ARTICLE_PROMPTS[input.type]
  if (!promptFn) return null

  const anthropic = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 })

  try {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_ARTICLE_MODEL || 'claude-haiku-4-5',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `${promptFn(eventContext, input.topic ?? '')}

RÉPONDS EN JSON STRICT avec cette structure :
{
  "title": "Titre de l'article (max 70 chars)",
  "excerpt": "Introduction/accroche en 1-2 phrases (max 200 chars)",
  "content": "Contenu HTML complet de l'article",
  "metaTitle": "Titre SEO optimisé (max 60 chars)",
  "metaDescription": "Meta description SEO (max 155 chars)",
  "keywords": "mot1, mot2, mot3, mot4, mot5",
  "tags": "tag1, tag2, tag3",
  "priority": 5,
  "selectedEventSlugs": ["slug1", "slug2"]
}

IMPORTANT : Le contenu doit être en HTML valide. Pas de markdown. Utilise <h2>, <p>, <strong>, <blockquote>, <ul>, <li>.
Le JSON doit être valide et parseable.`
        }
      ],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[Article Generator] No JSON in response')
      return null
    }

    const parsed = JSON.parse(jsonMatch[0])
    const today = new Date().toISOString().slice(0, 10)

    // Map selected event slugs to IDs
    const selectedSlugs: string[] = parsed.selectedEventSlugs ?? []
    const relatedIds = eventContext
      .filter((e) => selectedSlugs.includes(e.slug))
      .map((e) => e.id)

    return {
      title: parsed.title,
      slug: slugify(parsed.title, today),
      excerpt: parsed.excerpt,
      content: parsed.content,
      metaTitle: parsed.metaTitle ?? parsed.title,
      metaDescription: parsed.metaDescription ?? parsed.excerpt,
      keywords: parsed.keywords ?? '',
      tags: parsed.tags ?? '',
      type: input.type,
      priority: Math.min(10, Math.max(1, parsed.priority ?? 5)),
      relatedEventIds: relatedIds.join(','),
    }
  } catch (error) {
    console.error('[Article Generator] Error:', error)
    return null
  }
}

// ─── Batch Generation ───

/** Generate a balanced set of articles for the day */
export async function generateDailyArticles(count = 10): Promise<GeneratedArticle[]> {
  const eventContext = await getUpcomingEvents(50)
  const trending = await getTrendingCategories()

  // Define article mix for the day
  const articlePlan: ArticleInput[] = [
    // 3 actualités
    { type: 'actualite', eventContext, topic: `Actualité des ${trending[0] ?? 'événements'} à Paris` },
    { type: 'actualite', eventContext: eventContext.filter((e) => e.isFree), topic: 'Bons plans gratuits cette semaine' },
    { type: 'actualite', eventContext },
    // 3 sélections
    { type: 'selection', eventContext, topic: `Les incontournables de la semaine à Paris` },
    { type: 'selection', eventContext: eventContext.filter((e) => e.isFree), topic: 'Sorties gratuites à ne pas manquer' },
    { type: 'selection', eventContext },
    // 2 focus
    { type: 'focus', eventContext },
    { type: 'focus', eventContext: eventContext.slice(5) },
    // 1 tendance
    { type: 'tendance', eventContext, topic: trending.length > 0 ? `La montée de ${trending[0]} à Paris` : undefined },
    // 1 interview/portrait
    { type: 'interview', eventContext },
  ]

  const plan = articlePlan.slice(0, count)
  const generated: GeneratedArticle[] = []

  for (const input of plan) {
    try {
      const article = await generateArticle(input)
      if (article) {
        generated.push(article)
      }
    } catch (error) {
      console.error(`[Daily Gen] Failed to generate ${input.type}:`, error)
    }
  }

  return generated
}

/** Save generated articles to database */
export async function saveArticles(generatedArticles: GeneratedArticle[]): Promise<number> {
  let saved = 0

  for (const article of generatedArticles) {
    try {
      // Check for duplicate slug
      const existing = await db.select({ id: articles.id }).from(articles).where(eq(articles.slug, article.slug)).limit(1)
      if (existing.length > 0) {
        // Append random suffix
        article.slug += `-${Math.random().toString(36).slice(2, 6)}`
      }

      await db.insert(articles).values({
        title: article.title,
        slug: article.slug,
        excerpt: article.excerpt,
        content: article.content,
        metaTitle: article.metaTitle,
        metaDescription: article.metaDescription,
        keywords: article.keywords,
        tags: article.tags,
        type: article.type as 'actualite' | 'selection' | 'focus' | 'tendance' | 'interview',
        priority: article.priority,
        relatedEventIds: article.relatedEventIds || null,
        generatedBy: 'ai-daily',
        // AI drafts are never published automatically (scaled-content risk, possible
        // errors from scraped data): an editor sets status = 'published' after review.
        status: 'draft',
      })
      saved++
    } catch (error) {
      console.error(`[Save Article] Failed to save "${article.title}":`, error)
    }
  }

  return saved
}
