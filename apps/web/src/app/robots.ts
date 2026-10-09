import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Filtered / paginated variants are noindex with a canonical to the bare page: crawling
        // them only costs uncached database queries (each combination is a new cache entry).
        disallow: ['/api/', '/compte', '/login', '/onboarding', '/partage', '/*?'],
      },
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/sitemap-events.xml`],
  }
}
