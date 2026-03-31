import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Calendar, MapPin, ExternalLink, Share2, Euro, ArrowLeft } from 'lucide-react'
import { SaveButton } from '@/components/events/save-button'
import { formatPriceRange, formatEventDate } from '@/lib/utils'
import { db, events, venues, categories } from '@sortir/db'
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

  return {
    ...event,
    venue,
    category,
    tags: [] as { slug: string; name: string }[],
    ambiances: [] as { slug: string; name: string; emoji: string | null }[],
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const event = await getEvent(slug)
  if (!event) return { title: 'Événement introuvable' }

  return {
    title: `${event.title} — ${event.venue?.name ?? 'Paris'}`,
    description: event.shortDesc ?? event.description?.slice(0, 160) ?? '',
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

  // Safe date conversion
  const startDate = event.startDate ? new Date(event.startDate) : null
  const endDate = event.endDate ? new Date(event.endDate) : null

  // JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.shortDesc ?? '',
    startDate: event.startDate?.toString(),
    endDate: event.endDate?.toString(),
    location: event.venue
      ? {
          '@type': 'Place',
          name: event.venue.name,
          address: {
            '@type': 'PostalAddress',
            streetAddress: event.venue.address ?? '',
            addressLocality: event.venue.city ?? 'Paris',
            postalCode: event.venue.zipCode ?? '',
            addressCountry: 'FR',
          },
        }
      : undefined,
    offers: {
      '@type': 'Offer',
      price: event.priceMin ? event.priceMin / 100 : 0,
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      url: event.bookingUrl ?? '',
    },
    image: event.imageUrl ?? '',
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
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour
          </Link>
        </div>

        {/* Hero image */}
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-hover md:aspect-[2.5/1] md:rounded-2xl md:mx-4 md:max-w-[calc(100%-2rem)]">
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
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-accent/5 to-neon/5">
              <span className="text-7xl opacity-40">{event.category?.icon ?? '🎭'}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        </div>

        <div className="mx-auto max-w-3xl px-4 pt-6">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            {event.category && (
              <Link
                href={`/categories/${event.category.slug}`}
                className="rounded-lg bg-accent/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-accent hover:bg-accent/20 transition-colors"
              >
                {event.category.icon} {event.category.name}
              </Link>
            )}
            {event.isFree && (
              <span className="rounded-lg bg-free/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-free">
                Gratuit
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="mt-4 text-2xl font-bold leading-tight text-text-primary md:text-3xl">
            {event.title}
          </h1>

          {/* Info card */}
          <div className="mt-5 divide-y divide-border rounded-2xl border border-border bg-surface">
            {startDate && (
              <div className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10">
                  <Calendar className="h-4 w-4 text-accent" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-text-primary">
                    {formatEventDate(startDate)}
                  </p>
                  {endDate && (
                    <p className="text-[12px] text-text-muted">
                      Jusqu&apos;au {formatEventDate(endDate)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {event.venue && (
              <div className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-neon/10">
                  <MapPin className="h-4 w-4 text-neon" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-text-primary">
                    {event.venue.name}
                  </p>
                  {(event.venue.address || event.venue.arrondissement) && (
                    <p className="text-[12px] text-text-muted">
                      {event.venue.address}
                      {event.venue.arrondissement ? ` · ${event.venue.arrondissement}` : ''}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-free/10">
                <Euro className="h-4 w-4 text-free" />
              </div>
              <p className="text-[14px] font-semibold text-text-primary">
                {formatPriceRange(event.priceMin, event.priceMax, event.isFree)}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-5 flex gap-2.5">
            {event.bookingUrl ? (
              <a
                href={event.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-[14px] font-bold text-white shadow-lg shadow-accent/20 hover:bg-accent-hover transition-all active:scale-[0.98]"
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
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface hover:border-accent/30 hover:shadow-sm transition-all"
              />
            </div>
            <button className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface hover:border-accent/30 hover:shadow-sm transition-all">
              <Share2 className="h-4 w-4 text-text-secondary" />
            </button>
          </div>

          {/* Description */}
          {event.description && (
            <div className="mt-8">
              <h2 className="text-base font-bold text-text-primary">À propos</h2>
              <div className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-text-secondary">
                {event.description}
              </div>
            </div>
          )}

          {/* Venue details */}
          {event.venue && (
            <div className="mt-8">
              <h2 className="text-base font-bold text-text-primary">Lieu</h2>
              <div className="mt-3 rounded-2xl border border-border bg-surface p-5">
                <p className="font-semibold text-text-primary">{event.venue.name}</p>
                {event.venue.address && (
                  <p className="mt-1 text-[13px] text-text-secondary">{event.venue.address}</p>
                )}
                {event.venue.city && (
                  <p className="text-[13px] text-text-muted">
                    {event.venue.city}
                    {event.venue.zipCode ? ` ${event.venue.zipCode}` : ''}
                  </p>
                )}
                {event.venue.website && (
                  <a
                    href={event.venue.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:text-accent-hover transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Site du lieu
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Source */}
          {event.sourceUrl && (
            <div className="mt-8 rounded-xl bg-surface-hover/50 px-4 py-3">
              <p className="text-[11px] text-text-muted">
                Source :{' '}
                <a
                  href={event.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  {event.source === 'openagenda'
                    ? 'OpenAgenda'
                    : event.source === 'parisjazzclub'
                      ? 'Paris Jazz Club'
                      : event.source ?? 'Externe'}
                </a>
              </p>
            </div>
          )}
        </div>
      </article>
    </>
  )
}
