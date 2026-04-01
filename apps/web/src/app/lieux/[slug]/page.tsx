import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { MapPin, Globe, ArrowLeft } from 'lucide-react'
import { EventCard } from '@/components/events/event-card'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, desc } from 'drizzle-orm'

interface Props {
  params: Promise<{ slug: string }>
}

async function getVenue(slug: string) {
  const result = await db
    .select()
    .from(venues)
    .where(eq(venues.slug, slug))
    .limit(1)

  return result[0] || null
}

async function getVenueEvents(venueId: string) {
  const now = new Date()

  return db
    .select({ event: events, venue: venues, category: categories })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(
      and(
        eq(events.venueId, venueId),
        eq(events.status, 'active'),
        gte(events.startDate, now)
      )
    )
    .orderBy(desc(events.startDate))
    .limit(30)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const venue = await getVenue(slug)
  if (!venue) return { title: 'Lieu introuvable' }

  return {
    title: `${venue.name} — Événements — Paname Club`,
    description: `Tous les événements à venir à ${venue.name}${venue.address ? `, ${venue.address}` : ''}, Paris.`,
    openGraph: {
      title: `${venue.name} — Paname Club`,
      description: `Découvrez les prochains événements à ${venue.name}.`,
    },
  }
}

export default async function VenuePage({ params }: Props) {
  const { slug } = await params
  const venue = await getVenue(slug)

  if (!venue) notFound()

  const venueEvents = await getVenueEvents(venue.id)

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const hasCoords = venue.lat && venue.lng

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: venue.name,
    address: {
      '@type': 'PostalAddress',
      streetAddress: venue.address ?? '',
      addressLocality: venue.city ?? 'Paris',
      postalCode: venue.zipCode ?? '',
      addressCountry: 'FR',
    },
    ...(hasCoords && {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: venue.lat,
        longitude: venue.lng,
      },
    }),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="px-4 py-6 pb-24">
        {/* Back */}
        <Link href="/evenements" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour
        </Link>

        {/* Venue info */}
        <div className="mt-4">
          <h1 className="text-2xl font-bold text-text-primary">{venue.name}</h1>

          <div className="mt-3 flex flex-col gap-2">
            {(venue.address || venue.arrondissement) && (
              <div className="flex items-start gap-2 text-[14px] text-text-secondary">
                <MapPin className="h-4 w-4 flex-shrink-0 text-accent mt-0.5" />
                <span>
                  {venue.address}
                  {venue.arrondissement ? ` — ${venue.arrondissement} arr.` : ''}
                  {venue.city && venue.city !== 'Paris' ? `, ${venue.city}` : ''}
                  {venue.zipCode ? ` ${venue.zipCode}` : ''}
                </span>
              </div>
            )}

            {venue.website && (
              <a
                href={venue.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[14px] text-accent hover:text-accent-hover transition-colors"
              >
                <Globe className="h-4 w-4 flex-shrink-0" />
                Site web
              </a>
            )}
          </div>
        </div>

        {/* Static map */}
        {hasCoords && mapboxToken && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-border/60">
            <img
              src={`https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-s+7C3AED(${venue.lng},${venue.lat})/${venue.lng},${venue.lat},15,0/600x200@2x?access_token=${mapboxToken}`}
              alt={`Carte de ${venue.name}`}
              className="h-[200px] w-full object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* Upcoming events */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-text-primary">
            Événements à venir
          </h2>
          <p className="mt-1 text-[13px] text-text-muted">
            {venueEvents.length} événement{venueEvents.length !== 1 ? 's' : ''}
          </p>

          {venueEvents.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {venueEvents.map((item) => (
                <EventCard
                  key={item.event.id}
                  event={{
                    ...item.event,
                    category: item.category,
                    venue: item.venue,
                    tags: [],
                    ambiances: [],
                  } as never}
                />
              ))}
            </div>
          ) : (
            <div className="mt-8 text-center">
              <p className="text-3xl">📍</p>
              <p className="mt-3 text-[14px] text-text-muted">
                Aucun événement à venir dans ce lieu
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
