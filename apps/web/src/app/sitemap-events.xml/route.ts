import { db, events, venues } from '@sortir/db'
import { and, desc, eq, sql } from 'drizzle-orm'
import { liveCondition, withTimeout } from '@/lib/events/query'
import { SITE_URL } from '@/lib/site'

export const revalidate = 3600

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Every live, canonical event (ongoing exhibitions included), with its real
 * last modification date. Well under the 50 000 URLs limit of one sitemap.
 */
export async function GET() {
  let rows: Array<{ slug: string; updatedAt: Date }> = []
  try {
    rows = await withTimeout(
      db
        .select({ slug: events.slug, updatedAt: events.updatedAt })
        .from(events)
        .leftJoin(venues, eq(events.venueId, venues.id))
        .where(and(liveCondition(new Date()), sql`${events.qualityScore} >= 50`))
        .orderBy(desc(events.qualityScore))
        .limit(45000),
      20000,
      'sitemap-events'
    )
  } catch (err) {
    console.error('[sitemap-events]', err)
    return new Response('Service unavailable', { status: 503, headers: { 'Retry-After': '600' } })
  }

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    rows
      .map((r) => `<url><loc>${SITE_URL}/evenements/${esc(r.slug)}</loc><lastmod>${new Date(r.updatedAt).toISOString()}</lastmod></url>`)
      .join('\n') +
    '\n</urlset>\n'

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
