import type { Metadata } from 'next'

export const DEFAULT_OG_IMAGE = {
  url: '/og-default.png',
  width: 1200,
  height: 630,
  alt: 'Paname Club : que faire à Paris ce soir ?',
}

type SearchParams = Record<string, string | string[] | undefined>

/**
 * Listing pages: the bare URL is indexable; any filtered variant is noindex
 * with a canonical to the bare URL (avoids thousands of thin duplicates).
 */
export function listingMetadata(path: string, title: string, description: string, params?: SearchParams): Metadata {
  const filtered = params && Object.values(params).some((v) => v != null && v !== '')
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: filtered ? { index: false, follow: true } : undefined,
    // Redefining openGraph replaces the layout's: repeat the default share image.
    openGraph: { title, description, url: path, type: 'website', images: [DEFAULT_OG_IMAGE] },
  }
}
