import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Calendar, MapPin, ExternalLink, Share2 } from 'lucide-react'
import { SaveButton } from '@/components/events/save-button'
import { formatPriceRange, formatEventDate } from '@/lib/utils'
import { db, events, venues, categories, eventTags, tags, eventAmbiances, ambiances } from '@sortir/db'
import { eq } from 'drizzle-orm'

interface Props {
  params: Promise<{ slug: string }>
}

async function getEvent(slug: string) {
  const result = await db
    .select({ event: events, venue: venues, category: categories })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(eq(events.slug, slug))
    .limit(1)

  if (result.length === 0) return null

  const { event, venue, category } = result[0]

  const [eventTagsList, eventAmbiancesList] = await Promise.all([
    db
      .select({ tag: tags })
      .from(eventTags)
      .innerJoin(tags, eq(eventTags.tagId, tags.id))
      .where(eq(eventTags.eventId, event.id)),
    db
      .select({ ambiance: ambiances })
      .from(eventAmbiances)
      .innerJoin(ambiances, eq(eventAmbiances.ambianceId, ambiances.id))
      .where(eq(eventAmbiances.eventId, event.id)),
  ])

  return {
    ...event,
    venue,
    category,
    tags: eventTagsList.map((t) => t.tag),
    ambiances: eventAmbiancesList.map((a) => a.ambiance),
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const event = await getEvent(slug)
  if (!event) return { title: 'Événement introuvable' }

  return {
    title: `${event.title} — ${event.venue?.name ?? 'Paris'}`,
    description: event.shortDesc ?? event.description?.slice(0, 160),
    openGraph: {
      title: event.title,
      description: event.shortDesc ?? undefined,
      images: event.imageUrl ? [event.imageUrl] : undefined,
      type: 'article',
    },
  }
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params
  const event = await getEvent(slug)

  if (!event) notFound()

  // JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.shortDesc,
    startDate: event.startDate,
    endDate: event.endDate,
    location: event.venue
      ? {
          '@type': 'Place',
          name: event.venue.name,
          address: {
            '@type': 'PostalAddress',
            streetAddress: event.venue.address,
            addressLocality: event.venue.city,
            postalCode: event.venue.zipCode,
            addressCountry: 'FR',
          },
        }
      : undefined,
    offers: {
      '@type': 'Offer',
      price: event.priceMin / 100,
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      url: event.bookingUrl,
    },
    image: event.imageUrl,
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="pb-20">
        {/* Hero image */}
        <div className="relative aspect-[2/1] w-full overflow-hidden bg-border md:aspect-[3/1] md:rounded-b-xl">
          {event.imageUrl ? (
            <Image
              src={event.imageUrl}
              alt={event.title}
              fill
              className="object-cover"
              priority
              sizes="100vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-6xl text-text-muted">
              {event.category?.icon ?? '🎭'}
            </div>
          )}
        </div>

        <div className="mx-auto max-w-3xl px-4 pt-6">
          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            {event.category && (
              <Link
                href={`/categories/${event.category.slug}`}
                className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-text-secondary border border-border hover:border-border-strong"
              >
                {event.category.icon} {event.category.name}
              </Link>
            )}
            {event.isFree && (
              <span className="rounded-full bg-free/10 px-3 py-1 text-xs font-medium text-free">
                Gratuit
              </span>
            )}
            {event.ambiances?.map((a) => (
              <span
                key={a.slug}
                className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent"
              >
                {a.emoji} {a.name}
              </span>
            ))}
          </div>

          {/* Title */}
          <h1 className="mt-4 text-2xl font-bold text-text-primary md:text-3xl">
            {event.title}
          </h1>

          {/* Meta info */}
          <div className="mt-4 space-y-2">
            {event.startDate && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Calendar className="h-4 w-4" />
                <span>{formatEventDate(new Date(event.startDate))}</span>
                {event.endDate && (
                  <span className="text-text-muted">
                    — {formatEventDate(new Date(event.endDate))}
                  </span>
                )}
              </div>
            )}

            {event.venue && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <MapPin className="h-4 w-4" />
                <span className="hover:text-accent transition-colors">
                  {event.venue.name}
                </span>
                {event.venue.arrondissement && (
                  <span className="text-text-muted">· {event.venue.arrondissement}</span>
                )}
              </div>
            )}

            <p className="text-lg font-semibold text-text-primary">
              {formatPriceRange(event.priceMin, event.priceMax, event.isFree)}
            </p>
          </div>

          {/* Action buttons */}
          <div className="mt-6 flex gap-3">
            {event.bookingUrl && (
              <a
                href={event.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                {event.isFree ? 'Voir le site' : 'Réserver'}
              </a>
            )}
            <SaveButton eventId={event.id} className="h-12 w-12 rounded-lg border border-border" />
            <button className="flex h-12 w-12 items-center justify-center rounded-lg border border-border hover:bg-surface-hover transition-colors">
              <Share2 className="h-4 w-4 text-text-secondary" />
            </button>
          </div>

          {/* Description */}
          {event.description && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-text-primary">À propos</h2>
              <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-text-secondary">
                {event.description}
              </div>
            </div>
          )}

          {/* Venue info */}
          {event.venue && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-text-primary">Lieu</h2>
              <div className="mt-3 rounded-lg border border-border bg-surface p-4">
                <p className="font-medium text-text-primary">{event.venue.name}</p>
                {event.venue.address && (
                  <p className="mt-1 text-sm text-text-secondary">{event.venue.address}</p>
                )}
                {event.venue.lat && event.venue.lng && (
                  <div className="mt-3 h-48 rounded-md bg-border/50 flex items-center justify-center text-text-muted text-sm">
                    Carte interactive (Mapbox)
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </article>
    </>
  )
}
