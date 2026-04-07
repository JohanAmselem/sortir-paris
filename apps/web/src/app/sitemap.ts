import type { MetadataRoute } from 'next'
import { db, events, venues, categories, articles } from '@sortir/db'
import { eq, desc, gte, and } from 'drizzle-orm'

export const revalidate = 3600 // Regenerate every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.panameclub.fr'
  const now = new Date()

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/evenements`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${baseUrl}/ce-soir`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/ce-week-end`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/gratuit`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/carte`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${baseUrl}/surprise`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${baseUrl}/top`, lastModified: now, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${baseUrl}/match`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${baseUrl}/drop`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/quiz`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/collections`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/lieux`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/news`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/newsletter`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
  ]

  // Collection pages
  const collectionSlugs = [
    'expos-printemps', 'sorties-gratuites', 'concerts-jazz',
    'theatre-comedie', 'sorties-en-famille', 'soirees-dansantes',
  ]
  const collectionPages: MetadataRoute.Sitemap = collectionSlugs.map((slug) => ({
    url: `${baseUrl}/collections/${slug}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  // Category pages
  let categoryPages: MetadataRoute.Sitemap = []
  try {
    const cats = await db.select({ slug: categories.slug }).from(categories)
    categoryPages = cats.map((cat) => ({
      url: `${baseUrl}/categories/${cat.slug}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    }))
  } catch {
    // DB unavailable, skip
  }

  // Arrondissement pages
  const arrondissements = Array.from({ length: 20 }, (_, i) => {
    const n = i + 1
    return n === 1 ? '1er' : `${n}e`
  })
  const arrPages: MetadataRoute.Sitemap = arrondissements.map((arr) => ({
    url: `${baseUrl}/paris/${arr}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.6,
  }))

  // Active events (top 2000 by quality)
  let eventPages: MetadataRoute.Sitemap = []
  try {
    const activeEvents = await db
      .select({ slug: events.slug, updatedAt: events.updatedAt })
      .from(events)
      .where(and(eq(events.status, 'active'), gte(events.startDate, now)))
      .orderBy(desc(events.qualityScore))
      .limit(2000)

    eventPages = activeEvents.map((e) => ({
      url: `${baseUrl}/evenements/${e.slug}`,
      lastModified: e.updatedAt ?? now,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }))
  } catch {
    // DB unavailable, skip
  }

  // Venues with events
  let venuePages: MetadataRoute.Sitemap = []
  try {
    const activeVenues = await db
      .select({ slug: venues.slug })
      .from(venues)
      .limit(500)

    venuePages = activeVenues
      .filter((v) => v.slug)
      .map((v) => ({
        url: `${baseUrl}/lieux/${v.slug}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.4,
      }))
  } catch {
    // DB unavailable, skip
  }

  // Published articles
  let articlePages: MetadataRoute.Sitemap = []
  try {
    const publishedArticles = await db
      .select({ slug: articles.slug, updatedAt: articles.updatedAt })
      .from(articles)
      .where(eq(articles.status, 'published'))
      .orderBy(desc(articles.publishedAt))
      .limit(500)

    articlePages = publishedArticles.map((a) => ({
      url: `${baseUrl}/news/${a.slug}`,
      lastModified: a.updatedAt ?? now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))
  } catch {
    // DB unavailable, skip
  }

  return [
    ...staticPages,
    ...collectionPages,
    ...categoryPages,
    ...arrPages,
    ...eventPages,
    ...venuePages,
    ...articlePages,
  ]
}
