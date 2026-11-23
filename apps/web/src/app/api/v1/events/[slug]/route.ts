import { NextResponse, type NextRequest } from 'next/server'
import { getEventBySlug, getRunEnd, type EventDetail } from '@/lib/events/detail'
import { safeGetWorkDates } from '@/lib/events/works'
import { WORK_CATEGORIES, isGenericWorkSlug, workSlug } from '@/lib/events/works-utils'
import { bucketNow, diversify, safeQueryEvents } from '@/lib/events/query'
import { effectiveEnd, formatFullWhen, formatShortDay, formatTime, isLongRun, urgencyBadge } from '@/lib/paris-time'
import { formatPrice, looksCancelled, safeUrl, sourceLabel } from '@/lib/format'
import { followableFromTitle } from '@/lib/follows'
import { safeEventSoldOut, safeGetEventArtists } from '@/lib/member/artists'
import { absoluteUrl } from '@/lib/site'
import type { EventQuery } from '@/lib/events/types'
import type { EventResponse } from '@/lib/api-v1/contract'

/**
 * GET /api/v1/events/[slug] — la fiche événement de l'appli. Mêmes calculs que
 * app/evenements/[slug]/page.tsx (libellés à l'heure de Paris, bouton principal,
 * autres dates de l'œuvre, artistes à suivre, « Tu aimeras aussi »).
 */
export const dynamic = 'force-dynamic'

const HIDDEN = new Set(['rejected', 'draft'])
const MUSIC_CATEGORIES = ['concerts', 'festivals', 'soirees']
const EMPTY = { events: [], total: 0, hasMore: false }

function cta(e: EventDetail): { url: string; label: string } | null {
  const booking = safeUrl(e.bookingUrl)
  const source = safeUrl(e.sourceUrl)
  if (booking) return { url: booking, label: e.priceStatus === 'free' ? 'Infos & inscription' : 'Réserver' }
  if (source) return { url: source, label: 'Infos pratiques' }
  return null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!/^[^/\s]{1,300}$/.test(slug)) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 })

  let event: EventDetail | null
  try {
    event = await getEventBySlug(slug)
  } catch (err) {
    console.error('[api/v1/events/slug]', err)
    return NextResponse.json({ error: 'Impossible de charger cet événement.' }, { status: 503 })
  }
  if (!event || HIDDEN.has(event.status)) return NextResponse.json({ error: 'Cette sortie n’existe plus.' }, { status: 404 })
  // Doublon d'une autre source : l'appli suit la fiche canonique.
  if (event.canonicalSlug && event.canonicalSlug !== event.slug) {
    return NextResponse.json({ redirect: event.canonicalSlug }, { status: 308 })
  }

  const now = bucketNow()
  const past = effectiveEnd(event) < now
  const cancelled = event.status === 'cancelled' || looksCancelled(event.title, event.shortDesc)
  const isMusic = !!event.category && MUSIC_CATEGORIES.includes(event.category.slug)
  const start = new Date(event.startDate)
  const soon = start.getTime() - now.getTime() < 7 * 86400_000
  const similarBase: EventQuery = {
    categories: event.category ? [event.category.slug] : [],
    when: soon ? 'week' : 'month',
    excludeIds: [event.id],
    excludeTitle: event.title,
    withImage: true,
    sort: 'relevance',
    limit: 12,
  }
  const venueGeo = event.venue?.lat != null && event.venue?.lng != null ? { lat: event.venue.lat, lng: event.venue.lng, radiusKm: 3 } : null
  const work = workSlug(event.title)
  const hasWork =
    !past && !!event.category && (WORK_CATEGORIES as readonly string[]).includes(event.category.slug) && !isGenericWorkSlug(work)

  const [nearby, sameVenue, runEnd, workDates, eventArtists, soldOut] = await Promise.all([
    event.category && venueGeo ? safeQueryEvents({ ...similarBase, near: venueGeo }) : Promise.resolve(EMPTY),
    event.venue
      ? safeQueryEvents({ venueSlug: event.venue.slug, excludeIds: [event.id], excludeTitle: event.title, sort: 'soon', limit: 6 })
      : Promise.resolve(EMPTY),
    event.category?.slug === 'expos' && event.venue && !isLongRun(event) && !past
      ? getRunEnd(event.venue.id, event.title).catch(() => null)
      : Promise.resolve(null),
    hasWork ? safeGetWorkDates(work) : Promise.resolve([]),
    safeGetEventArtists(event.id),
    isMusic && !past ? safeEventSoldOut(event.id) : Promise.resolve(false),
  ])

  const similar =
    nearby.events.length >= 4 || !event.category
      ? nearby
      : await safeQueryEvents({ ...similarBase, excludeIds: [event.id, ...nearby.events.map((e) => e.id)] })
  const sameVenueIds = new Set(sameVenue.events.map((e) => e.id))
  const similarPool = similar === nearby ? nearby.events : [...nearby.events, ...similar.events]

  const followable = followableFromTitle(event.title)
  const artists = isMusic
    ? eventArtists.length
      ? eventArtists.slice(0, 6)
      : followable
        ? [{ key: followable.term, name: followable.label }]
        : []
    : []

  const when = formatFullWhen(event, now)
  const runEndDate = runEnd ? new Date(runEnd) : null
  const whenShown =
    runEndDate && runEndDate.getTime() - start.getTime() > 36 * 3600_000
      ? {
          primary: `Jusqu’au ${formatShortDay(runEndDate)}`,
          secondary: event.timeKnown && event.endDate ? `Ce jour-là : ${formatTime(start)} – ${formatTime(new Date(event.endDate))}` : when.secondary,
        }
      : when

  const body = {
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      shortDesc: event.shortDesc,
      imageUrl: event.imageUrl,
      startDate: event.startDate,
      endDate: event.endDate,
      timeKnown: event.timeKnown,
      priceMin: event.priceMin,
      priceMax: event.priceMax,
      priceStatus: event.priceStatus,
      isFree: event.isFree,
      saveCount: event.saveCount,
      attendanceCount: event.attendanceCount,
      category: event.category ? { slug: event.category.slug, name: event.category.name } : null,
      venue: event.venue,
      when: whenShown,
      price: formatPrice(event),
      badge: past ? null : urgencyBadge(event, now),
      past,
      cancelled,
      soldOut,
      cta: cta(event),
      sourceLabel: sourceLabel(event.source),
      webUrl: absoluteUrl(`/evenements/${event.slug}`),
    },
    artists,
    otherDates: workDates
      .filter((d) => d.id !== event.id)
      .slice(0, 30)
      .map((d) => ({
        slug: d.slug,
        startDate: d.startDate,
        venueName: d.venue?.name ?? null,
        venueSlug: d.venue?.slug ?? null,
        arrondissement: d.venue?.arrondissement ?? null,
      })),
    workSlug: hasWork && workDates.length > 1 ? work : null,
    sameVenue: sameVenue.events,
    similar: diversify(similarPool.filter((e) => !sameVenueIds.has(e.id)), 8),
  } satisfies EventResponse

  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } })
}
