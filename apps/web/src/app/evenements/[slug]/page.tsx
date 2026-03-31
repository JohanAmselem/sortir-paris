import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Calendar, MapPin, ExternalLink, Share2, Clock, ArrowLeft } from 'lucide-react'
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
        {/* Back button */}
        <div className="px-4 py-3">
          <Link
            href="/evenements"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Link>
        </div>

        {/* Hero image */}
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-hover md:aspect-[2.5/1] md:rounded-xl md:mx-4 md:max-w-[calc(100%-2rem)]">
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
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-accent/10 to-neon/10">
              <span className="text-7xl opacity-60">{event.category?.icon ?? '🎭'}</span>
            </div>
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        </div>

        <div className="mx-auto max-w-3xl px-4 pt-6">
          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            {event.category && (
              <Link
                href={`/categories/${event.category.slug}`}
                className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent hover:bg-accent/20 transition-colors"
              >
                {event.category.icon} {event.category.name}
              </Link>
            )}
            {event.isFree && (
              <span className="rounded-full bg-free/10 px-3 py-1 text-xs font-semibold text-free">
                Gratuit
              </span>
            )}
            {event.ambiances?.map((a) => (
              <span
                key={a.slug}
                className="rounded-full bg-surface-hover px-3 py-1 text-xs font-medium text-text-secondary"
              >
                {a.emoji} {a.name}
              </span>
            ))}
          </div>

          {/* Title */}
          <h1 className="mt-4 text-2xl font-bold text-text-primary leading-tight md:text-3xl">
            {event.title}
          </h1>

          {/* Key info card */}
          <div className="mt-5 rounded-xl border border-border bg-surface p-4 space-y-3">
            {event.startDate && (
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10">
                  <Calendar className="h-4 w-4 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {formatEventDate(new Date(event.startDate))}
                  </p>
                  {event.endDate && (
                    <p className="text-xs text-text-muted">
                      Jusqu&apos;au {formatEventDate(new Date(event.endDate))}
                    </p>
                  )}
                </div>
              </div>
            )}

            {event.venue && (
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-neon/10">
                  <MapPin className="h-4 w-4 text-neon" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {event.venue.name}
                  </p>
                  {(event.venue.address || event.venue.arrondissement) && (
                    <p className="text-xs text-text-muted">
                      {event.venue.address}{event.venue.arrondissement ? ` · ${event.venue.arrondissement}` : ''}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-free/10">
                <Clock className="h-4 w-4 text-free" />
              </div>
              <p className="text-sm font-semibold text-text-primary">
                {formatPriceRange(event.priceMin, event.priceMax, event.isFree)}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-5 flex gap-3">
            {event.bookingUrl ? (
              <a
                href={event.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent/90 transition-all active:scale-[0.98]"
              >
                <ExternalLink className="h-4 w-4" />
                {event.isFree ? 'Voir le site' : 'Réserver'}
              </a>
            ) : (
              <div className="flex-1" />
            )}
            <div onClick={(e) => e.stopPropagation()}>
              <SaveButton
                eventId={event.id}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-border hover:border-accent/30 hover:shadow-md transition-all"
              />
            </div>
            <button className="flex h-12 w-12 items-center justify-center rounded-xl border border-border hover:border-accent/30 hover:shadow-md transition-all">
              <Share2 className="h-4 w-4 text-text-secondary" />
            </button>
          </div>

          {/* Description */}
          {event.description && (
            <div className="mt-8">
              <h2 className="text-lg font-bold text-text-primary">À propos</h2>
              <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-text-secondary">
                {event.description}
              </div>
            </div>
          )}

          {/* Tags */}
          {event.tags && event.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {event.tags.map((tag) => (
                <span
                  key={tag.slug}
                  className="rounded-full bg-surface-hover px-3 py-1 text-xs font-medium text-text-secondary"
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          )}

          {/* Venue details */}
          {event.venue && (
            <div className="mt-8">
              <h2 className="text-lg font-bold text-text-primary">Lieu</h2>
              <div className="mt-3 rounded-xl border border-border bg-surface p-5">
                <p className="font-semibold text-text-primary">{event.venue.name}</p>
                {event.venue.address && (
                  <p className="mt-1 text-sm text-text-secondary">{event.venue.address}</p>
                )}
                {event.venue.city && (
                  <p className="text-sm text-text-muted">{event.venue.city}{event.venue.zipCode ? ` ${event.venue.zipCode}` : ''}</p>
                )}
                {event.venue.website && (
                  <a
                    href={event.venue.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Site du lieu
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Source attribution */}
          {event.sourceUrl && (
            <div className="mt-8 rounded-lg bg-surface-hover/50 p-4">
              <p className="text-xs text-text-muted">
                Source :{' '}
                <a
                  href={event.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  {event.source === 'openagenda' ? 'OpenAgenda' : event.source === 'parisjazzclub' ? 'Paris Jazz Club' : event.source ?? 'Externe'}
                </a>
              </p>
            </div>
          )}
        </div>
      </article>
    </>
  )
}
