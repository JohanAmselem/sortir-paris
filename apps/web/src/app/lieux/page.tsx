import { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Calendar } from 'lucide-react'
import { SearchBar } from '@/components/search/search-bar'
import { db, venues, events } from '@sortir/db'
import { eq, and, gte, sql, desc, count } from 'drizzle-orm'

export const metadata: Metadata = {
  title: 'Lieux — Salles et espaces culturels à Paris',
  description: 'Découvrez les salles de spectacle, galeries, musées et lieux culturels de Paris.',
  alternates: { canonical: '/lieux' },
}

export const revalidate = 3600

async function getVenues() {
  const now = new Date()

  // Get venues with active event count
  const results = await db
    .select({
      venue: venues,
      eventCount: count(events.id),
    })
    .from(venues)
    .leftJoin(events, and(
      eq(events.venueId, venues.id),
      eq(events.status, 'active'),
      gte(events.startDate, now),
    ))
    .groupBy(venues.id)
    .having(sql`count(${events.id}) > 0`)
    .orderBy(desc(count(events.id)))
    .limit(100)

  return results
}

export default async function LieuxPage() {
  const venuesList = await getVenues()

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold text-text-primary">Lieux</h1>
      <p className="mt-0.5 text-[13px] text-text-muted">
        {venuesList.length} lieux avec des événements à venir
      </p>

      <div className="mt-4">
        <SearchBar className="max-w-lg" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {venuesList.map(({ venue, eventCount }) => (
          <Link
            key={venue.id}
            href={`/lieux/${venue.slug}`}
            className="group flex gap-4 rounded-2xl border border-border/60 bg-surface p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-accent/20"
          >
            {/* Venue image or placeholder */}
            <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-surface-hover">
              {venue.imageUrl ? (
                <Image
                  src={venue.imageUrl}
                  alt={venue.name}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="80px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/5 to-neon/5">
                  <MapPin className="h-6 w-6 text-text-muted" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-[14px] font-semibold text-text-primary group-hover:text-accent transition-colors truncate">
                {venue.name}
              </h2>
              {venue.address && (
                <p className="mt-0.5 text-[12px] text-text-muted truncate">
                  {venue.address}
                </p>
              )}
              {venue.arrondissement && (
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-text-muted">
                  <MapPin className="h-2.5 w-2.5" />
                  {venue.arrondissement}
                </p>
              )}
              <p className="mt-1.5 flex items-center gap-1 text-[12px] font-medium text-accent">
                <Calendar className="h-3 w-3" />
                {eventCount} événement{Number(eventCount) > 1 ? 's' : ''} à venir
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
