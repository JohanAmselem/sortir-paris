import type { Metadata } from 'next'

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
    openGraph: { title, description, url: path, type: 'website' },
  }
}
