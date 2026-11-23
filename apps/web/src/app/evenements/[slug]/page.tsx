import type { Metadata } from 'next'
import type { EventQuery } from '@/lib/events/types'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { ArrowRight, BellRing, CalendarDays, CalendarPlus, MapPin, Ticket } from 'lucide-react'
import { EventImage } from '@/components/ui/event-image'
import { SaveButton } from '@/components/events/save-button'
import { ShareButton } from '@/components/ui/share-button'
import { ViewTracker } from '@/components/events/view-tracker'
import { AttendButton } from '@/components/events/attend-button'
import { FollowButton } from '@/components/follow/follow-button'
import { followableFromTitle } from '@/lib/follows'
import { safeEventSoldOut, safeGetEventArtists } from '@/lib/member/artists'
import { BookingBar, BookingButton } from '@/components/events/booking'
import { OutboundLink } from '@/components/events/outbound-link'
import { EventRail, SectionHeader } from '@/components/events/blocks'
import { getEventBySlug, getRunEnd, type EventDetail } from '@/lib/events/detail'
import { safeGetWorkDates } from '@/lib/events/works'
import { WORK_CATEGORIES, isGenericWorkSlug, workSlug } from '@/lib/events/works-utils'
import { bucketNow, diversify, safeQueryEvents } from '@/lib/events/query'
import { effectiveEnd, formatCountdown, formatFullWhen, formatLongDay, formatShortDay, isLongRun, parisISODate, parisMonthKey, urgencyBadge } from '@/lib/paris-time'
import { formatHour, monthTitle, premier } from '@/lib/agenda-view'
import { cardPrice, formatEuros, formatPrice, looksCancelled, safeUrl, sourceLabel } from '@/lib/format'
import { safeJsonLd } from '@/lib/json-ld'
import { absoluteUrl } from '@/lib/site'

export const revalidate = 600

interface Props {
  params: Promise<{ slug: string }>
}

/** Aucune page au build : chacune est rendue à la première visite, puis mise en cache (ISR). */
export function generateStaticParams() {
  return []
}

const HIDDEN = new Set(['rejected', 'draft'])
/** Catégories où l'on propose de suivre les artistes (Alertes concerts). */
const MUSIC_CATEGORIES = ['concerts', 'festivals', 'soirees'] as const

/** « A », « A et B », « A, B et C ». */
function namesList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  const shown = names.slice(0, 3)
  const rest = names.length - shown.length
  if (rest > 0) return `${shown.join(', ')} et ${rest} autre${rest > 1 ? 's' : ''}`
  return `${shown.slice(0, -1).join(', ')} et ${shown[shown.length - 1]}`
}

/** Le bouton principal : la billetterie, sinon la page de la source. */
function cta(e: EventDetail): { href: string | null; label: string } {
  const booking = safeUrl(e.bookingUrl)
  const source = safeUrl(e.sourceUrl)
  if (booking) return { href: booking, label: e.priceStatus === 'free' ? 'S’inscrire' : 'Réserver' }
  if (source) return { href: source, label: e.priceStatus === 'free' ? 'Infos pratiques' : 'Réserver' }
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
  // Les erreurs remontent : une panne de base ne doit pas être mise en cache comme un « introuvable ».
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

/**
 * Lien « Calendrier » (Google Agenda) : journée entière quand l'heure est
 * inconnue ; pour une expo, le jour même (ou son premier jour), pas trois mois.
 */
function googleCalendarUrl(e: EventDetail, now: Date): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const day = (d: Date) => parisISODate(d).replace(/-/g, '')
  const start = new Date(e.startDate)
  let dates: string
  if (isLongRun(e) || !e.timeKnown) {
    const first = isLongRun(e) && start < now ? now : start
    const next = new Date(first.getTime() + 24 * 3600_000)
    dates = `${day(first)}/${day(next)}`
  } else {
    dates = `${fmt(start)}/${fmt(effectiveEnd(e))}`
  }
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates,
    details: absoluteUrl(`/evenements/${e.slug}`),
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
            availability: e.status === 'cancelled' ? 'https://schema.org/Discontinued' : 'https://schema.org/InStock',
            ...(href ? { url: href } : {}),
          },
        }
      : {}),
    ...(e.venue ? { organizer: { '@type': 'Organization', name: e.venue.name, url: safeUrl(e.venue.website) ?? absoluteUrl(`/lieux/${e.venue.slug}`) } } : {}),
  }
}

/** « 38,50 € à 66 € », « 25 € », « Gratuit », « Prix sur la billetterie ». */
function priceFact(e: EventDetail): { primary: string; secondary: string | null; tone: 'free' | 'paid' | 'unknown' } {
  const p = cardPrice(e)
  if (p.tone !== 'paid') return { primary: p.label, secondary: p.tone === 'free' ? 'Annoncé gratuit par l’organisateur' : 'Le prix n’est pas communiqué', tone: p.tone }
  const min = Math.min(e.priceMin || e.priceMax, e.priceMax || e.priceMin)
  const max = Math.max(e.priceMin, e.priceMax)
  return { primary: min < max ? `${formatEuros(min)} à ${formatEuros(max)}` : formatEuros(max), secondary: 'Selon la billetterie', tone: 'paid' }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** « 28 bd des Capucines · 9e » (sans répéter la ville déjà dans l'adresse). */
function venueLine(v: NonNullable<EventDetail['venue']>): string | null {
  const area = v.arrondissement ?? (v.city && v.city.toLowerCase() !== 'paris' ? v.city : null)
  const address = v.address?.trim() || null
  if (!address) return area
  return area && !address.toLowerCase().includes(area.toLowerCase()) ? `${address} · ${area}` : address
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params
  let event: EventDetail | null = null
  try {
    event = await getEventBySlug(slug)
  } catch (err) {
    console.error('[fiche]', err)
    throw new Error('Impossible de charger cet événement')
  }
  if (!event || HIDDEN.has(event.status)) notFound()
  if (event.canonicalSlug && event.canonicalSlug !== event.slug) permanentRedirect(`/evenements/${event.canonicalSlug}`)

  const now = bucketNow()
  const past = effectiveEnd(event) < now
  // Certaines sources gardent une sortie annulée « active » et ne le disent que dans le texte.
  const cancelled = event.status === 'cancelled' || looksCancelled(event.title, event.shortDesc)
  const live = !past && !cancelled
  const when = formatFullWhen(event, now)
  const action = cta(event)
  const badge = past ? null : urgencyBadge(event, now)
  const followable = followableFromTitle(event.title)
  const start = new Date(event.startDate)
  const longRun = isLongRun(event)

  const venueGeo = event.venue?.lat != null && event.venue?.lng != null ? { lat: event.venue.lat, lng: event.venue.lng, radiusKm: 3 } : null
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
  const runEndPromise =
    event.category?.slug === 'expos' && event.venue && !longRun && !past ? getRunEnd(event.venue.id, event.title).catch(() => null) : Promise.resolve(null)
  // Même œuvre ailleurs ou à d'autres dates : spectacles vivants seulement.
  const work = workSlug(event.title)
  const hasWork = !past && !!event.category && (WORK_CATEGORIES as readonly string[]).includes(event.category.slug) && !isGenericWorkSlug(work)
  const isMusic = !!event.category && (MUSIC_CATEGORIES as readonly string[]).includes(event.category.slug)
  // « Le même mois dans ce lieu » : le mois de la sortie (ou ce mois-ci pour une expo en cours).
  const monthKey = parisMonthKey(longRun && start < now ? now : start)
  const empty = { events: [], total: 0, hasMore: false }
  const [similar, sameMonth, runEnd, workDates, eventArtists, soldOut] = await Promise.all([
    event.category ? safeQueryEvents({ ...similarBase, ...(venueGeo ? { near: venueGeo } : {}) }) : Promise.resolve(empty),
    event.venue
      ? safeQueryEvents({ venueSlug: event.venue.slug, when: monthKey, excludeIds: [event.id], excludeTitle: event.title, sort: 'soon', limit: 10 })
      : Promise.resolve(empty),
    runEndPromise,
    hasWork ? safeGetWorkDates(work) : Promise.resolve([]),
    safeGetEventArtists(event.id),
    isMusic && !past ? safeEventSoldOut(event.id) : Promise.resolve(false),
  ])
  // Suivre : les artistes liés à la sortie, sinon le titre.
  const followTargets = eventArtists.length ? eventArtists.slice(0, 4) : followable && isMusic ? [{ key: followable.term, name: followable.label }] : []
  const otherDates = workDates.filter((d) => d.id !== event.id && new Date(d.startDate) >= now)
  const sameMonthIds = new Set(sameMonth.events.map((e) => e.id))
  const similarEvents = diversify(similar.events.filter((e) => !sameMonthIds.has(e.id)), 8)

  // Expo publiée jour par jour : on montre la période (« Jusqu’au 25 janv. »).
  const runEndDate = runEnd ? new Date(runEnd) : null
  const runShown = runEndDate && runEndDate.getTime() - start.getTime() > 36 * 3600_000
  const countdown = live && !longRun ? formatCountdown(start, now) : null
  const whenFact = runShown
    ? { primary: `Jusqu’au ${formatShortDay(runEndDate!, now)}`, secondary: when.secondary }
    : longRun
      ? { primary: when.primary, secondary: when.secondary }
      : {
          primary: when.primary,
          secondary: [event.timeKnown ? formatHour(start) : 'Horaire à venir', countdown].filter(Boolean).join(' · '),
        }
  const price = priceFact(event)
  const priceFrom = cardPrice(event)
  const bookingDetail = priceFrom.tone === 'paid' ? priceFrom.label : priceFrom.tone === 'free' ? 'gratuit' : null

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
  const hasGeo = event.venue?.lat != null && event.venue?.lng != null
  const text = event.description || event.shortDesc

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(eventJsonLd(event, past)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }} />
      <ViewTracker eventId={event.id} />

      <article className="pb-32 md:pb-16">
        <div className="md:grid md:grid-cols-[1.05fr_1fr] md:gap-10 md:px-4 md:pt-8">
          <div className="relative aspect-[4/5] max-h-[78vh] w-full overflow-hidden bg-surface sm:aspect-[4/3] md:aspect-[4/5] md:rounded-2xl">
            <EventImage
              src={event.imageUrl}
              alt={event.title}
              fallback="lg"
              fallbackTop
              sizes="(max-width: 768px) 100vw, 640px"
              priority
              categorySlug={event.category?.slug}
            />
            <div className="absolute inset-0 bg-linear-to-b from-surface-dark/40 via-transparent via-30% to-paper md:hidden" aria-hidden />
            <div className="absolute right-3 top-3 flex gap-2">
              {live && (
                <a
                  href={googleCalendarUrl(event, now)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Ajouter à mon calendrier"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-dark/55 text-ink backdrop-blur-md hover:bg-surface-dark/75"
                >
                  <CalendarPlus className="h-5 w-5" aria-hidden />
                </a>
              )}
              <ShareButton title={event.title} className="border-0 bg-surface-dark/55 backdrop-blur-md hover:bg-surface-dark/75" />
            </div>
            {badge && <span className="t-micro absolute left-3 top-4 rounded-md bg-neon px-2 py-1 text-paper">{badge}</span>}
          </div>

          <div className="relative -mt-10 px-4 md:mt-0 md:px-0">
            {(past || cancelled) && (
              <div className="t-body mb-4 rounded-xl border border-neon/40 bg-neon-soft px-4 py-3 text-ink" role="status">
                {cancelled ? 'Cette sortie a été annulée par l’organisateur.' : 'Cette sortie est terminée.'}{' '}
                {similarEvents.length > 0 && (
                  <a href="#similaires" className="font-semibold text-accent underline underline-offset-2">
                    Voir des sorties du même genre
                  </a>
                )}
              </div>
            )}

            {event.category && (
              <Link href={`/categories/${event.category.slug}`} className="t-micro inline-flex min-h-8 items-center text-accent hover:underline">
                {event.category.name}
                {soldOut && live ? ' · Complet' : ''}
              </Link>
            )}
            <h1 className={(event.title.length > 48 ? 't-title1' : 't-display') + ' mt-1 break-words ' + (cancelled ? 'text-text-secondary line-through decoration-2' : 'text-ink')}>{event.title}</h1>

            <div className="mt-5 border-t border-border">
              <Fact icon={<CalendarDays className="h-5 w-5" aria-hidden />} term="Quand" primary={premier(cap(whenFact.primary))} secondary={whenFact.secondary}>
                {live && (
                  <a href={googleCalendarUrl(event, now)} target="_blank" rel="noopener noreferrer" className="t-small inline-flex min-h-11 items-center font-semibold text-accent hover:underline">
                    Calendrier
                  </a>
                )}
              </Fact>
              {event.venue && (
                <Fact
                  icon={<MapPin className="h-5 w-5" aria-hidden />}
                  term="Où"
                  primary={
                    <Link href={`/lieux/${event.venue.slug}`} className="hover:underline">
                      {event.venue.name}
                    </Link>
                  }
                  secondary={venueLine(event.venue)}
                >
                  {hasGeo && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${event.venue.lat},${event.venue.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="t-small inline-flex min-h-11 items-center font-semibold text-accent hover:underline"
                    >
                      Itinéraire
                    </a>
                  )}
                </Fact>
              )}
              <Fact
                icon={<Ticket className="h-5 w-5" aria-hidden />}
                term="Prix"
                primary={<span className={price.tone === 'free' ? 'text-free' : price.tone === 'unknown' ? 'text-text-secondary' : undefined}>{price.primary}</span>}
                secondary={price.secondary}
              />
            </div>

            {live && (
              <div className="mt-5 hidden items-center gap-3 md:flex">
                {action.href ? (
                  <BookingButton href={action.href} label={action.label} detail={bookingDetail} eventId={event.id} source={event.source} className="flex-1" />
                ) : (
                  <p className="t-small flex-1 text-text-muted">Pas de lien de réservation pour cette sortie.</p>
                )}
                <SaveButton eventId={event.id} appearance="button" />
              </div>
            )}
            {live && (
              <div className="mt-4">
                <AttendButton eventId={event.id} />
              </div>
            )}

            {text && (
              <div className="t-body mt-6 max-w-[68ch] whitespace-pre-line text-ink-soft">
                <h2 className="sr-only">À propos</h2>
                {text}
              </div>
            )}
            <p className="t-small mt-3 text-text-faint">
              Infos :{' '}
              {safeUrl(event.sourceUrl) ? (
                <OutboundLink href={safeUrl(event.sourceUrl)!} eventId={event.id} source={event.source} kind="source" className="underline underline-offset-2 hover:text-ink">
                  {sourceLabel(event.source)}
                </OutboundLink>
              ) : (
                sourceLabel(event.source)
              )}{' '}
              · horaires et prix à confirmer sur la billetterie
            </p>

            {followTargets.length > 0 && (
              <section aria-labelledby="suivre-titre" className="mt-6 rounded-2xl border border-border bg-surface p-4">
                <h2 id="suivre-titre" className="t-body flex items-start gap-2 font-bold text-ink">
                  <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
                  {past || soldOut
                    ? `${soldOut && !past ? 'Complet' : 'C’est passé'} : sois prévenu de la prochaine date`
                    : `Suivre ${namesList(followTargets.map((a) => a.name))}`}
                </h2>
                <p className="t-small mt-1 text-text-muted">Une alerte à chaque nouvelle date à Paris, et la veille du concert.</p>
                <ul className="mt-3 flex flex-wrap gap-2" aria-label="Suivre les artistes">
                  {followTargets.map((a) => (
                    <li key={a.key} className="flex items-center gap-2 rounded-full border border-border-strong py-1 pl-4 pr-1">
                      <span className="t-small max-w-[12rem] truncate font-semibold text-ink">{a.name}</span>
                      <FollowButton compact target={{ kind: 'artist', term: a.key, label: a.name }} label={`Suivre ${a.name}`} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {otherDates.length > 0 && (
              <section aria-labelledby="dates-titre" className="mt-8">
                <h2 id="dates-titre" className="t-title3 text-ink">
                  {otherDates.length > 1 ? `${otherDates.length} autres dates` : 'Une autre date'}
                </h2>
                <ul className="mt-2 divide-y divide-border border-y border-border">
                  {otherDates.slice(0, 6).map((d) => (
                    <li key={d.id}>
                      <Link href={`/evenements/${d.slug}`} className="flex min-h-12 items-center justify-between gap-3 py-2.5 hover:text-accent">
                        <span className="min-w-0">
                          <span className="t-body block font-semibold text-ink">{premier(cap(formatLongDay(new Date(d.startDate), now)))}</span>
                          <span className="t-small block truncate text-text-muted">
                            {[d.timeKnown ? formatHour(new Date(d.startDate)) : null, d.venue?.name].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
                {otherDates.length > 6 && (
                  <Link href={`/oeuvres/${work}`} className="t-small mt-2 inline-flex min-h-11 items-center gap-1 font-semibold text-accent hover:underline">
                    Toutes les dates
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                )}
              </section>
            )}
          </div>
        </div>

        {event.venue && sameMonth.events.length > 0 && (
          <section className="mt-14 px-4" aria-labelledby="meme-mois-titre">
            <SectionHeader
              id="meme-mois-titre"
              title="Le même mois dans ce lieu"
              sub={`${event.venue.name} · ${monthTitle(monthKey, now).toLowerCase()}`}
              href={`/lieux/${event.venue.slug}`}
              linkLabel="Tout le lieu"
            />
            <EventRail events={sameMonth.events} now={now} className="mt-4" />
          </section>
        )}

        {similarEvents.length > 0 && (
          <section id="similaires" className="mt-14 scroll-mt-20 px-4" aria-labelledby="similaires-titre">
            <SectionHeader
              id="similaires-titre"
              title="Dans le même genre"
              href={event.category ? `/categories/${event.category.slug}` : '/agenda'}
            />
            <EventRail events={similarEvents} now={now} className="mt-4" />
          </section>
        )}
      </article>

      {live && <BookingBar eventId={event.id} href={action.href} label={action.label} detail={bookingDetail} source={event.source} />}
    </>
  )
}

function Fact({
  icon,
  term,
  primary,
  secondary,
  children,
}: {
  icon: React.ReactNode
  term: string
  primary: React.ReactNode
  secondary?: string | null
  children?: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[24px_1fr_auto] items-center gap-3 border-b border-border py-3">
      <span className="text-text-muted">{icon}</span>
      <p className="min-w-0">
        <span className="sr-only">{term} : </span>
        <span className="t-body block font-bold text-ink">{primary}</span>
        {secondary && <span className="t-small block text-text-muted">{secondary}</span>}
      </p>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
