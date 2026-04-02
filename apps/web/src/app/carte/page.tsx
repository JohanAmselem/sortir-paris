import { Metadata } from 'next'
import { MapWrapper } from '@/components/map/map-wrapper'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, isNotNull, desc } from 'drizzle-orm'
import type { MapEvent } from '@/components/map/event-map'

export const metadata: Metadata = {
  title: 'Carte des événements — Paris',
  description: 'Explorez les événements culturels à Paris sur une carte interactive. Concerts, expos, théâtre, soirées près de chez vous.',
  alternates: { canonical: '/carte' },
}

export const revalidate = 300 // Revalidate every 5 minutes

async function getGeocodedEvents(): Promise<MapEvent[]> {
  const now = new Date()

  const results = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      imageUrl: events.imageUrl,
      startDate: events.startDate,
      isFree: events.isFree,
      categorySlug: categories.slug,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      venueName: venues.name,
      lat: venues.lat,
      lng: venues.lng,
    })
    .from(events)
    .innerJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(
      and(
        eq(events.status, 'active'),
        gte(events.startDate, now),
        isNotNull(venues.lat),
        isNotNull(venues.lng)
      )
    )
    .orderBy(desc(events.qualityScore))
    .limit(500)

  return results
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      imageUrl: r.imageUrl,
      startDate: r.startDate?.toISOString() ?? null,
      isFree: r.isFree ?? false,
      categorySlug: r.categorySlug,
      categoryName: r.categoryName,
      categoryIcon: r.categoryIcon,
      venueName: r.venueName,
      lat: r.lat!,
      lng: r.lng!,
    }))
}

export default async function CartePage() {
  const mapEvents = await getGeocodedEvents()

  return (
    <div className="px-0 md:px-4 md:py-4">
      {/* Header — visible on mobile */}
      <div className="px-4 py-3 md:hidden">
        <h1 className="text-lg font-bold text-text-primary">Carte</h1>
        <p className="text-[12px] text-text-muted">
          {mapEvents.length} événement{mapEvents.length !== 1 ? 's' : ''} sur la carte
        </p>
      </div>

      <MapWrapper events={mapEvents} />
    </div>
  )
}
