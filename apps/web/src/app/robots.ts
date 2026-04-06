import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.panameclub.fr'

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/compte/', '/login', '/onboarding', '/partage'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
