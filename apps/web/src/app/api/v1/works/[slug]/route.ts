import { NextResponse, type NextRequest } from 'next/server'
import { getWorkDates } from '@/lib/events/works'
import { getFilmSeances } from '@/lib/events/films'
import { WORK_SLUG_RE, bestWorkImage, bestWorkText, bestWorkTitle } from '@/lib/events/works-utils'
import { bucketNow } from '@/lib/events/query'
import { effectiveEnd } from '@/lib/paris-time'
import { formatPrice, safeUrl } from '@/lib/format'
import { absoluteUrl } from '@/lib/site'
import type { WorkDateV1, WorkResponse } from '@/lib/api-v1/contract'

/**
 * GET /api/v1/works/[slug]?kind=work|film — toutes les dates d'une œuvre
 * (pièce, spectacle, concert en tournée…) ou toutes les séances d'un film.
 * Mêmes données que /oeuvres/[slug] et /films/[slug].
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const kind = req.nextUrl.searchParams.get('kind') === 'film' ? 'film' : 'work'
  if (!WORK_SLUG_RE.test(slug) || slug.length > 160) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 })
  const now = bucketNow()
  try {
    if (kind === 'film') {
      const seances = await getFilmSeances(slug)
      if (!seances.length) return NextResponse.json({ error: 'Plus de séance à venir.' }, { status: 404 })
      const first = seances[0]
      const body = {
        kind,
        slug,
        title: first.title,
        description: seances.find((s) => s.shortDesc)?.shortDesc ?? null,
        imageUrl: seances.find((s) => s.imageUrl)?.imageUrl ?? null,
        category: first.category ? { slug: first.category.slug, name: first.category.name } : null,
        dates: seances.map(
          (s): WorkDateV1 => ({
            id: s.id,
            slug: s.slug,
            startDate: s.startDate,
            endDate: s.endDate,
            timeKnown: s.timeKnown,
            price: formatPrice(s),
            bookingUrl: null,
            venue: s.venue ? { name: s.venue.name, slug: s.venue.slug, arrondissement: s.venue.arrondissement, city: s.venue.city ?? null } : null,
          })
        ),
        webUrl: absoluteUrl(`/films/${slug}`),
      } satisfies WorkResponse
      return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } })
    }

    const rows = (await getWorkDates(slug)).filter((r) => effectiveEnd(r) >= now)
    if (!rows.length) return NextResponse.json({ error: 'Plus de date à venir.' }, { status: 404 })
    const category = rows.find((r) => r.category)?.category ?? null
    const body = {
      kind,
      slug,
      title: bestWorkTitle(rows) ?? rows[0].title,
      description: bestWorkText(rows),
      imageUrl: bestWorkImage(rows),
      category: category ? { slug: category.slug, name: category.name } : null,
      dates: rows.map(
        (r): WorkDateV1 => ({
          id: r.id,
          slug: r.slug,
          startDate: r.startDate,
          endDate: r.endDate,
          timeKnown: r.timeKnown,
          price: formatPrice(r),
          bookingUrl: safeUrl(r.bookingUrl) ?? safeUrl(r.sourceUrl),
          venue: r.venue ? { name: r.venue.name, slug: r.venue.slug, arrondissement: r.venue.arrondissement, city: r.venue.city } : null,
        })
      ),
      webUrl: absoluteUrl(`/oeuvres/${slug}`),
    } satisfies WorkResponse
    return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } })
  } catch (err) {
    console.error('[api/v1/works/slug]', err)
    return NextResponse.json({ error: 'Impossible de charger ces dates.' }, { status: 503 })
  }
}
