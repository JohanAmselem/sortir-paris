/**
 * Larger variants of the thumbnails some sources publish (verified 23/11/2026):
 *   Offi          …/images/120/<hash>.jpg  → …/images/1000/<hash>.jpg
 *   Theatreonline …/spectacle/<id>/xs_1_affiche.jpg → …/spectacle/<id>/1_affiche.jpg
 * Pure (shared with the mobile app). The scrapers store the large variant from
 * now on; this keeps older rows sharp until they are rewritten.
 */
export function hdImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.includes('files.offi.fr/')) return url.replace('/images/120/', '/images/1000/')
  // Only the poster files (xs_1_affiche.jpg), as the scrapers and 0013_images_hd.sql do.
  if (url.includes('theatreonline.com/')) return url.replace(/\/xs_(\d+_affiche\.[a-z]+)$/i, '/$1')
  return url
}
