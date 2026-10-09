import type { Metadata } from 'next'
import type { EventQuery } from '@/lib/events/types'
import Link from 'next/link'
import Image from 'next/image'
import { notFound, permanentRedirect } from 'next/navigation'
import { CalendarPlus, ExternalLink, MapPin } from 'lucide-react'
import { EventImage } from '@/components/ui/event-image'
import { SaveButton } from '@/components/events/save-button'
import { ShareButton } from '@/components/ui/share-button'
import { ViewTracker } from '@/components/events/view-tracker'
import { EventReviews } from '@/components/events/event-reviews'
import { AttendButton } from '@/components/events/attend-button'
import { EventActionBar } from '@/components/events/sticky-booking-cta'
import { OutboundLink } from '@/components/events/outbound-link'
import { EventRail, SectionHeader } from '@/components/events/blocks'
import { getEventBySlug, getRunEnd, type EventDetail } from '@/lib/events/detail'
import { bucketNow, diversify, safeQueryEvents } from '@/lib/events/query'
import { effectiveEnd, formatFullWhen, formatShortDay, formatTime, isLongRun, urgencyBadge } from '@/lib/paris-time'
import { formatPrice, looksCancelled, safeUrl, sourceLabel } from '@/lib/format'
import { safeJsonLd } from '@/lib/json-ld'
import { absoluteUrl } from '@/lib/site'

export const revalidate = 600

interface Props {
  params: Promise<{ slug: string }>
}

/** No pages at build time: each one is rendered on first visit, then cached (ISR). */
export function generateStaticParams() {
  return []
}

const HIDDEN = new Set(['rejected', 'draft'])

function cta(e: EventDetail): { href: string | null; label: string } {
  const booking = safeUrl(e.bookingUrl)
  const source = safeUrl(e.sourceUrl)
  if (booking) return { href: booking, label: e.priceStatus === 'free' ? 'Infos & inscription' : 'Réserver' }
  if (source) return { href: source, label: 'Infos pratiques' }
  return { href: null, label: '' }
}

function description(e: EventDetail): string {
  const text = e.shortDesc || e.description || ''
  const clean = text.replace(/\s+/g, ' ').trim()
  const where = e.venue ? ` à ${e.venue.name}${e.venue.arrondissement ? ` (${e.venue.arrondissement})` : ''}` : ' à Paris'
  const base = clean.length > 40 ? clean : `${e.title}${where}. ${clean}`
  return base.length > 158 ? base.slice(0, 155).replace(/\s+\S*$/, '') + '…' : base
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  // Errors propagate: a database outage must not be cached as a noindex "introuvable".
  const e = await getEventBySlug(slug)
  if (!e || HIDDEN.has(e.status)) return { title: 'Événement introuvable', robots: { index: false } }
  const past = effectiveEnd(e) < new Date()
  const title = `${e.title}${e.venue ? ` · ${e.venue.name}` : ''}`
  return {
    title,
    description: description(e),
    alternates: { canonical: `/evenements/${e.canonicalSlug ?? e.slug}` },
    robots: past || e.status === 'expired' || e.status === 'cancelled' ? { index: false, follow: true } : undefined,
    openGraph: { title, description: description(e), type: 'website', url: `/evenements/${e.slug}` },
  }
}

function googleCalendarUrl(e: EventDetail): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const start = new Date(e.startDate)
  const end = effectiveEnd(e)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${fmt(start)}/${fmt(isLongRun(e) ? new Date(start.getTime() + 2 * 3600_000) : end)}`,
    details: `${absoluteUrl(`/evenements/${e.slug}`)}`,
    location: [e.venue?.name, e.venue?.address, e.venue?.zipCode].filter(Boolean).join(', '),
    ctz: 'Europe/Paris',
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

function eventJsonLd(e: EventDetail, past: boolean) {
  const price = formatPrice(e)
  const href = cta(e).href
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: e.title,
    description: description(e),
    startDate: e.timeKnown ? e.startDate : e.startDate.slice(0, 10),
    ...(e.endDate ? { endDate: e.endDate } : {}),
    eventStatus: e.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: absoluteUrl(`/evenements/${e.slug}`),
    image: e.imageUrl ? [e.imageUrl] : [absoluteUrl('/og-default.png')],
    location: e.venue
      ? {
          '@type': 'Place',
          name: e.venue.name,
          url: absoluteUrl(`/lieux/${e.venue.slug}`),
          address: {
            '@type': 'PostalAddress',
            ...(e.venue.address ? { streetAddress: e.venue.address } : {}),
            addressLocality: e.venue.city || 'Paris',
            ...(e.venue.zipCode ? { postalCode: e.venue.zipCode } : {}),
            addressCountry: 'FR',
          },
          ...(e.venue.lat != null && e.venue.lng != null
            ? { geo: { '@type': 'GeoCoordinates', latitude: e.venue.lat, longitude: e.venue.lng } }
            : {}),
        }
      : { '@type': 'Place', name: 'Paris', address: { '@type': 'PostalAddress', addressLocality: 'Paris', addressCountry: 'FR' } },
    ...(price.tone !== 'unknown' && !past
      ? {
          offers: {
            '@type': 'Offer',
            price: price.tone === 'free' ? '0' : (Math.min(e.priceMin || e.priceMax, e.priceMax || e.priceMin) / 100).toFixed(2),
            priceCurrency: 'EUR',
            ...(href ? { url: href } : {}),
          },
        }
      : {}),
    ...(e.venue ? { organizer: { '@type': 'Organization', name: e.venue.name, url: safeUrl(e.venue.website) ?? absoluteUrl(`/lieux/${e.venue.slug}`) } } : {}),
  }
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params
  let event: EventDetail | null = null
  try {
    event = await getEventBySlug(slug)
  } catch (err) {
    console.error('[event page]', err)
    throw new Error('Impossible de charger cet événement')
  }
  if (!event || HIDDEN.has(event.status)) notFound()
  if (event.canonicalSlug && event.canonicalSlug !== event.slug) permanentRedirect(`/evenements/${event.canonicalSlug}`)

  const now = bucketNow()
  const past = effectiveEnd(event) < now
  // Some sources keep a cancelled event "active" and only say so in the text.
  const cancelled = event.status === 'cancelled' || looksCancelled(event.title, event.shortDesc)
  const when = formatFullWhen(event, now)
  const price = formatPrice(event)
  const action = cta(event)
  const badge = past ? null : urgencyBadge(event, now)

  // "Tu aimeras aussi": same category, near the venue, around the same time,
  // never another séance / date of the same title.
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
  const runEndPromise =
    event.category?.slug === 'expos' && event.venue && !isLongRun(event) && !past
      ? getRunEnd(event.venue.id, event.title).catch(() => null)
      : Promise.resolve(null)
  const [nearby, sameVenue, runEnd] = await Promise.all([
    event.category && venueGeo ? safeQueryEvents({ ...similarBase, near: venueGeo }) : Promise.resolve({ events: [], total: 0, hasMore: false }),
    event.venue
      ? safeQueryEvents({ venueSlug: event.venue.slug, excludeIds: [event.id], excludeTitle: event.title, sort: 'soon', limit: 6 })
      : Promise.resolve({ events: [], total: 0, hasMore: false }),
    runEndPromise,
  ])
  // Not enough nearby: the same category anywhere in Paris.
  const similar =
    nearby.events.length >= 4 || !event.category ? nearby : await safeQueryEvents({ ...similarBase, excludeIds: [event.id, ...nearby.events.map((e) => e.id)] })
  const sameVenueIds = new Set(sameVenue.events.map((e) => e.id))
  const similarPool = similar === nearby ? nearby.events : [...nearby.events, ...similar.events]
  const similarEvents = diversify(similarPool.filter((e) => !sameVenueIds.has(e.id)), 8)
  // Exhibition published day by day: show the run ("Jusqu'au 25 janv.").
  const runEndDate = runEnd ? new Date(runEnd) : null
  const whenShown =
    runEndDate && runEndDate.getTime() - start.getTime() > 36 * 3600_000
      ? {
          primary: `Jusqu’au ${formatShortDay(runEndDate)}`,
          secondary: event.timeKnown && event.endDate ? `Ce jour-là : ${formatTime(start)} – ${formatTime(new Date(event.endDate))}` : when.secondary,
        }
      : when

  const crumbs = [
    { name: 'Accueil', href: '/' },
    ...(event.category ? [{ name: event.category.name, href: `/categories/${event.category.slug}` }] : []),
    { name: event.title, href: `/evenements/${event.slug}` },
  ]
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absoluteUrl(c.href) })),
  }
  const mapToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const hasGeo = event.venue?.lat != null && event.venue?.lng != null

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(eventJsonLd(event, past)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }} />
      <ViewTracker eventId={event.id} />

      <article className="pb-28 md:pb-16">
        <nav aria-label="Fil d’Ariane" className="px-4 py-3">
          <ol className="flex min-w-0 items-center gap-1.5 text-[13px] text-text-secondary">
            {crumbs.slice(0, -1).map((c) => (
              <li key={c.href} className="flex items-center gap-1.5">
                <Link href={c.href} className="hover:text-ink hover:underline">
                  {c.name}
                </Link>
                <span aria-hidden>/</span>
              </li>
            ))}
            <li className="truncate text-text-muted" aria-current="page">
              {event.title}
            </li>
          </ol>
        </nav>

        <div className="md:grid md:grid-cols-[1.1fr_1fr] md:gap-10 md:px-4">
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-paper-deep md:aspect-[4/5] md:rounded-xl">
            <EventImage src={event.imageUrl} alt={event.title} sizes="(max-width: 768px) 100vw, 600px" priority categorySlug={event.category?.slug} />
            {badge && (
              <span className="absolute left-3 top-3 rounded bg-neon px-2 py-1 text-[13px] font-bold uppercase tracking-wide text-paper">{badge}</span>
            )}
          </div>

          <div className="px-4 pt-5 md:px-0 md:pt-0">
            {(past || cancelled) && (
              <div className="mb-4 rounded-lg border border-neon/40 bg-neon-soft px-4 py-3 text-[15px] text-ink" role="status">
                {cancelled ? 'Cet événement a été annulé par l’organisateur.' : 'Cet événement est terminé.'}{' '}
                {similarEvents.length > 0 && (
                  <a href="#similaires" className="font-semibold text-accent underline underline-offset-2">
                    Voir des sorties similaires à venir
                  </a>
                )}
              </div>
            )}

            {event.category && (
              <Link href={`/categories/${event.category.slug}`} className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent hover:underline">
                {event.category.name}
              </Link>
            )}
            {cancelled && (
              <p className="mt-2 inline-flex rounded bg-neon px-2 py-1 text-[13px] font-bold uppercase tracking-wide text-paper">Annulé</p>
            )}
            <h1 className={'font-display mt-1 text-[2.6rem] sm:text-[3.2rem] ' + (cancelled ? 'text-text-secondary line-through decoration-2' : 'text-ink')}>
              {event.title}
            </h1>

            <dl className="mt-5 divide-y divide-border border-y border-border">
              <div className="flex gap-3 py-3">
                <dt className="w-16 shrink-0 text-[13px] font-semibold uppercase tracking-wide text-text-muted">Quand</dt>
                <dd>
                  <p className="text-[16px] font-semibold text-ink">{whenShown.primary}</p>
                  {whenShown.secondary && <p className="text-[15px] text-text-secondary">{whenShown.secondary}</p>}
                </dd>
              </div>
              {event.venue && (
                <div className="flex gap-3 py-3">
                  <dt className="w-16 shrink-0 text-[13px] font-semibold uppercase tracking-wide text-text-muted">Où</dt>
                  <dd className="min-w-0">
                    <Link href={`/lieux/${event.venue.slug}`} className="text-[16px] font-semibold text-ink hover:underline">
                      {event.venue.name}
                    </Link>
                    <p className="text-[15px] text-text-secondary">
                      {[event.venue.address, event.venue.zipCode && `${event.venue.zipCode} ${event.venue.city}`].filter(Boolean).join(', ') ||
                        event.venue.arrondissement ||
                        event.venue.city}
                    </p>
                  </dd>
                </div>
              )}
              <div className="flex gap-3 py-3">
                <dt className="w-16 shrink-0 text-[13px] font-semibold uppercase tracking-wide text-text-muted">Prix</dt>
                <dd className={price.tone === 'free' ? 'text-[16px] font-semibold text-free' : price.tone === 'unknown' ? 'text-[15px] text-text-secondary' : 'text-[16px] font-semibold text-ink'}>
                  {price.tone === 'unknown'
                    ? price.label === 'Prix sur le site'
                      ? 'Prix sur le site de l’organisateur'
                      : 'Non communiqué, à vérifier auprès de l’organisateur'
                    : price.label}
                </dd>
              </div>
            </dl>

            {!past && !cancelled && (
              <div className="mt-5 hidden flex-wrap items-center gap-2 md:flex">
                {action.href && (
                  <OutboundLink
                    href={action.href}
                    eventId={event.id}
                    source={event.source}
                    kind="booking"
                    className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-[15px] font-semibold text-paper transition-colors hover:bg-accent-hover"
                  >
                    {action.label}
                    <ExternalLink className="h-4 w-4" aria-hidden />
                  </OutboundLink>
                )}
                <SaveButton eventId={event.id} appearance="button" />
                <ShareButton title={event.title} className="h-11 w-11" />
              </div>
            )}

            {!past && !cancelled && (
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                <AttendButton eventId={event.id} />
                <a
                  href={googleCalendarUrl(event)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-2 text-[14px] font-semibold text-ink hover:text-accent"
                >
                  <CalendarPlus className="h-4 w-4" aria-hidden />
                  Ajouter à l’agenda
                </a>
              </div>
            )}

            {(event.saveCount > 1 || event.attendanceCount > 1) && (
              <p className="mt-3 text-[14px] text-text-secondary">
                {event.attendanceCount > 1 ? `${event.attendanceCount} membres y vont` : `${event.saveCount} membres l’ont gardé`}
              </p>
            )}
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4">
          {(event.description || event.shortDesc) && (
            <section className="mt-10" aria-labelledby="about-title">
              <h2 id="about-title" className="font-display text-[1.8rem] text-ink">
                À propos
              </h2>
              <div className="mt-3 max-w-[68ch] whitespace-pre-line text-[16px] leading-[1.7] text-ink-soft">
                {event.description || event.shortDesc}
              </div>
            </section>
          )}

          {event.venue && (
            <section className="mt-10" aria-labelledby="venue-title">
              <h2 id="venue-title" className="font-display text-[1.8rem] text-ink">
                Le lieu
              </h2>
              <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface">
                {hasGeo && mapToken && (
                  <Link
                    href={`/carte?lat=${event.venue.lat}&lng=${event.venue.lng}&zoom=15`}
                    className="group relative block aspect-[5/2] w-full bg-paper-deep"
                    aria-label={`Voir ${event.venue.name} sur la carte`}
                  >
                    <Image
                      src={`https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-l+7c3aed(${event.venue.lng},${event.venue.lat})/${event.venue.lng},${event.venue.lat},14.5,0/640x256@2x?access_token=${mapToken}`}
                      alt=""
                      fill
                      unoptimized
                      sizes="(max-width: 768px) 100vw, 640px"
                      className="object-cover"
                    />
                    <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[13px] font-semibold text-paper">
                      <MapPin className="h-3.5 w-3.5" aria-hidden /> Voir autour
                    </span>
                  </Link>
                )}
                <div className="p-4">
                  <Link href={`/lieux/${event.venue.slug}`} className="text-[17px] font-semibold text-ink hover:underline">
                    {event.venue.name}
                  </Link>
                  {event.venue.address && <p className="mt-1 text-[15px] text-text-secondary">{event.venue.address}</p>}
                  <p className="text-[15px] text-text-secondary">
                    {[event.venue.zipCode, event.venue.city].filter(Boolean).join(' ')}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                    {hasGeo && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${event.venue.lat},${event.venue.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-11 items-center text-[14px] font-semibold text-accent hover:underline"
                      >
                        Itinéraire
                      </a>
                    )}
                    {safeUrl(event.venue.website) && (
                      <OutboundLink
                        href={safeUrl(event.venue.website)!}
                        eventId={event.id}
                        source={event.source}
                        kind="venue"
                        className="inline-flex h-11 items-center gap-1.5 text-[14px] font-semibold text-accent hover:underline"
                      >
                        Site du lieu <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </OutboundLink>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          <EventReviews eventId={event.id} />

          <p className="mt-8 text-[14px] text-text-secondary">
            Informations fournies par{' '}
            {safeUrl(event.sourceUrl) ? (
              <OutboundLink href={safeUrl(event.sourceUrl)!} eventId={event.id} source={event.source} kind="source" className="font-medium text-ink underline underline-offset-2">
                {sourceLabel(event.source)}
              </OutboundLink>
            ) : (
              sourceLabel(event.source)
            )}
            . Horaires et tarifs peuvent changer : vérifie auprès de l’organisateur avant de te déplacer.
          </p>
        </div>

        {sameVenue.events.length > 0 && (
          <section className="mt-14 px-4" aria-labelledby="venue-next-title">
            <SectionHeader id="venue-next-title" kicker="Au même endroit" title={`Bientôt à ${event.venue!.name}`} href={`/lieux/${event.venue!.slug}`} />
            <EventRail events={sameVenue.events} now={now} className="mt-5" />
          </section>
        )}

        {similarEvents.length > 0 && (
          <section id="similaires" className="mt-14 scroll-mt-20 px-4" aria-labelledby="similar-title">
            <SectionHeader
              id="similar-title"
              kicker="Dans le même esprit"
              title="Tu aimeras aussi"
              href={event.category ? `/categories/${event.category.slug}` : '/evenements'}
            />
            <EventRail events={similarEvents} now={now} className="mt-5" />
          </section>
        )}
      </article>

      {!past && !cancelled && <EventActionBar eventId={event.id} title={event.title} href={action.href} label={action.label} source={event.source} />}
    </>
  )
}
