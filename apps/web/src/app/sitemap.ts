import type { MetadataRoute } from 'next'
import { ARRONDISSEMENTS, CATEGORIES } from '@/lib/events/taxonomy'
import { sitemapMonthPaths } from '@/lib/agenda-pages'
import { getActiveVenues } from '@/lib/venues'
import { SITE_URL } from '@/lib/site'

export const revalidate = 3600

/**
 * Hub pages + venues with upcoming events. Events live in /sitemap-events.xml
 * (with their real lastmod). No lastModified on hub pages: a fake "now" teaches
 * Google to ignore the signal.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hubs: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE_URL}/agenda`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/ce-soir`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE_URL}/ce-week-end`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/gratuit`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/carte`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/lieux`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/alertes-concerts`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/mentions-legales`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${SITE_URL}/confidentialite`, changeFrequency: 'yearly', priority: 0.1 },
    // Pages mois indexables : les 12 prochains mois, seuls et par grande catégorie.
    ...sitemapMonthPaths().map((path) => ({ url: `${SITE_URL}${path}`, changeFrequency: 'daily' as const, priority: path.split('/').length > 3 ? 0.6 : 0.7 })),
    ...CATEGORIES.map((c) => ({ url: `${SITE_URL}/categories/${c.slug}`, changeFrequency: 'daily' as const, priority: 0.8 })),
    ...ARRONDISSEMENTS.map((a) => ({ url: `${SITE_URL}/paris/${a}`, changeFrequency: 'daily' as const, priority: 0.7 })),
  ]

  let venuePages: MetadataRoute.Sitemap = []
  try {
    const venues = await getActiveVenues(20000) // every venue with an upcoming event (was capped at 2 000)
    venuePages = venues
      .filter((v) => v.upcoming >= 1)
      .map((v) => ({ url: `${SITE_URL}/lieux/${v.slug}`, changeFrequency: 'weekly' as const, priority: 0.5 }))
  } catch {
    // Keep the hub pages if the DB is unavailable.
  }

  return [...hubs, ...venuePages]
}
