/**
 * Image hosts served through the Next.js image optimiser (next.config.ts reads
 * IMAGE_HOSTS). Going through the optimiser also fixes hosts that block
 * hotlinking: billetreduc.com (Cross-Origin-Resource-Policy: same-site) and
 * sortiraparis.com (403 with a foreign Referer) accept the server-side fetch.
 * Other hosts are rendered unoptimised (no open proxy, optimiser quota).
 */
export const IMAGE_HOSTS = [
  'cdn.paris.fr',
  '**.paris.fr',
  'img.openagenda.com',
  'cdn.openagenda.com',
  'img.evbuc.com',
  '**.acsta.net',
  'image.tmdb.org',
  'www.billetreduc.com',
  'billetreduc.com',
  'cdn.sortiraparis.com',
  'www.sortiraparis.com',
  'images.unsplash.com',
  'files.offi.fr',
  'www.theatreonline.com',
  's1.ticketm.net',
  'www.cinematheque.fr',
]

/** Same list as regular expressions, for EventImage. */
const PATTERNS = IMAGE_HOSTS.map((h) =>
  h.startsWith('**.') ? new RegExp(`(^|\\.)${h.slice(3).replace(/\./g, '\\.')}$`) : new RegExp(`^${h.replace(/\./g, '\\.')}$`)
)

export function isOptimizedImage(src: string): boolean {
  try {
    const url = new URL(src)
    if (url.protocol !== 'https:') return false
    return PATTERNS.some((re) => re.test(url.hostname))
  } catch {
    return false
  }
}
