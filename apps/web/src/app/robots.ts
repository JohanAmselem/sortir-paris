import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Search and filtered variants are noindex anyway; keep crawlers (and the LLM) off free-text queries.
        disallow: ['/api/', '/compte', '/login', '/onboarding', '/partage', '/*?*q=', '/surprise?'],
      },
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/sitemap-events.xml`],
  }
}
