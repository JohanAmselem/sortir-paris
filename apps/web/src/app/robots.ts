import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        // Slides downloaded by Instagram (Meta's crawler must not be blocked; images are X-Robots-Tag: noindex).
        allow: ['/', '/api/instagram/media/'],
        // Filtered / paginated variants are noindex with a canonical to the bare page: crawling
        // them only costs uncached database queries (each combination is a new cache entry).
        disallow: ['/api/', '/admin', '/compte', '/login', '/onboarding', '/partage', '/*?'],
      },
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/sitemap-events.xml`],
  }
}
