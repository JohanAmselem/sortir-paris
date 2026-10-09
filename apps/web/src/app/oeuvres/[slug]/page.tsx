import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink, MapPin } from 'lucide-react'
import { EmptyState } from '@/components/events/blocks'
import { OutboundLink } from '@/components/events/outbound-link'
import { SignatureBadge } from '@/components/events/signature-badge'
import { EventImage } from '@/components/ui/event-image'
import { bucketNow } from '@/lib/events/query'
import { getWorkDates, WORK_DATES_LIMIT, type WorkRow } from '@/lib/events/works'
import { bestWorkImage, bestWorkText, bestWorkTitle, groupWorkByVenue, WORK_SLUG_RE } from '@/lib/events/works-utils'
import { effectiveEnd, formatWhen } from '@/lib/paris-time'
import { formatPrice, safeUrl } from '@/lib/format'
import { safeJsonLd } from '@/lib/json-ld'
import { absoluteUrl } from '@/lib/site'

export const revalidate = 600

interface Props {
  params: Promise<{ slug: string }>
}

/** Rendered on first visit, then cached (ISR). */
export function generateStaticParams() {
  return []
}

/** Dates shown per venue before "Voir les N autres dates". */
const DATES_SHOWN = 8
/** Numbered pins on the static map. */
const MAX_PINS = 12

const validSlug = (slug: string) => WORK_SLUG_RE.test(slug) && slug.length <= 160

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  if (!validSlug(slug)) return { title: 'Œuvre introuvable', robots: { index: false } }
  const rows = await getWorkDates(slug)
  if (!rows.length) return { title: 'Aucune date à venir', robots: { index: false, follow: true } }
  const title = bestWorkTitle(rows) ?? rows[0].title
  const venues = new Set(rows.map((r) => r.venue?.slug ?? 'x')).size
  const n = rows.length >= WORK_DATES_LIMIT ? `plus de ${WORK_DATES_LIMIT}` : String(rows.length)
  return {
    title: `${title} : toutes les dates à Paris`,
    description: `${title} à Paris : ${n} date${rows.length > 1 ? 's' : ''} dans ${venues} lieu${venues > 1 ? 'x' : ''}, avec les prix et les liens de réservation.`,
    alternates: { canonical: `/oeuvres/${slug}` },
    // A single date is already covered by its event page.
    robots: rows.length < 2 ? { index: false, follow: true } : undefined,
  }
}

function priceLabel(g: { priceMin: number; priceMax: number; anyFree: boolean }): string | null {
  if (g.priceMax > 0) {
    return formatPrice({ priceMin: g.priceMin, priceMax: g.priceMax, priceStatus: 'paid', isFree: false }).label.replace(
      'Prix sur le site',
      'Prix sur le site de réservation'
    )
  }
  return g.anyFree ? 'Gratuit' : null
}

function staticMapUrl(pins: Array<{ lat: number; lng: number }>, token: string): string {
  const overlays = pins.map((p, i) => `pin-s-${i + 1}+7c3aed(${p.lng},${p.lat})`).join(',')
  const center = pins.length === 1 ? `${pins[0].lng},${pins[0].lat},14,0` : 'auto'
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${overlays}/${center}/720x320@2x?padding=48&access_token=${token}`
}

function eventsJsonLd(title: string, slug: string, rows: WorkRow[], image: string | null) {
  return rows.slice(0, 20).map((r) => {
    const price = formatPrice(r)
    const href = safeUrl(r.bookingUrl) ?? safeUrl(r.sourceUrl)
    return {
      '@type': 'Event',
      name: title,
      startDate: r.timeKnown ? r.startDate : r.startDate.slice(0, 10),
      ...(r.endDate ? { endDate: r.endDate } : {}),
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      url: absoluteUrl(`/evenements/${r.slug}`),
      ...(image ? { image: [image] } : {}),
      superEvent: { '@type': 'EventSeries', name: title, url: absoluteUrl(`/oeuvres/${slug}`) },
      location: r.venue
        ? {
            '@type': 'Place',
            name: r.venue.name,
            url: absoluteUrl(`/lieux/${r.venue.slug}`),
            address: {
              '@type': 'PostalAddress',
              ...(r.venue.address ? { streetAddress: r.venue.address } : {}),
              addressLocality: r.venue.city || 'Paris',
              ...(r.venue.zipCode ? { postalCode: r.venue.zipCode } : {}),
              addressCountry: 'FR',
            },
          }
        : { '@type': 'Place', name: 'Paris', address: { '@type': 'PostalAddress', addressLocality: 'Paris', addressCountry: 'FR' } },
      ...(price.tone !== 'unknown'
        ? {
            offers: {
              '@type': 'Offer',
              price: price.tone === 'free' ? '0' : (Math.min(r.priceMin || r.priceMax, r.priceMax || r.priceMin) / 100).toFixed(2),
              priceCurrency: 'EUR',
              availability: 'https://schema.org/InStock',
              ...(href ? { url: href } : {}),
            },
          }
        : {}),
    }
  })
}

export default async function WorkPage({ params }: Props) {
  const { slug } = await params
  if (!validSlug(slug)) notFound()
  const now = bucketNow()
  const rows = (await getWorkDates(slug)).filter((r) => effectiveEnd(r) >= now)

  if (!rows.length) {
    return (
      <div className="px-4 pt-8">
        <EmptyState
          title="Plus de date à venir"
          actions={[
            { href: '/categories/theatre', label: 'Le théâtre à l’affiche' },
            { href: '/evenements?when=week', label: 'Les sorties de la semaine' },
          ]}
        >
          Nous n’avons plus de date repérée à Paris pour ce spectacle.
        </EmptyState>
      </div>
    )
  }

  const title = bestWorkTitle(rows) ?? rows[0].title
  const image = bestWorkImage(rows)
  const text = bestWorkText(rows)
  const groups = groupWorkByVenue(rows)
  const category = rows.find((r) => r.category)?.category ?? null
  const mapToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const pinned = groups.filter((g) => g.venue?.lat != null && g.venue?.lng != null).slice(0, MAX_PINS)
  const pinIndex = new Map(pinned.map((g, i) => [g.key, i + 1]))
  const total = rows.length >= WORK_DATES_LIMIT ? `Plus de ${WORK_DATES_LIMIT}` : String(rows.length)

  const crumbs = [
    { name: 'Accueil', href: '/' },
    ...(category ? [{ name: category.name, href: `/categories/${category.slug}` }] : []),
    { name: title, href: `/oeuvres/${slug}` },
  ]
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      ...eventsJsonLd(title, slug, rows, image),
      {
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absoluteUrl(c.href) })),
      },
    ],
  }

  return (
    <div className="px-4 pb-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <nav aria-label="Fil d’Ariane" className="py-3 text-[13px] text-text-secondary">
        <ol className="flex min-w-0 items-center gap-1.5">
          {crumbs.slice(0, -1).map((c) => (
            <li key={c.href} className="flex items-center gap-1.5">
              <Link href={c.href} className="hover:text-ink hover:underline">
                {c.name}
              </Link>
              <span aria-hidden>/</span>
            </li>
          ))}
          <li className="truncate text-text-muted" aria-current="page">
            {title}
          </li>
        </ol>
      </nav>

      <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_1fr] md:gap-10">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-paper-deep md:aspect-[4/5]">
          <EventImage src={image} alt={title} sizes="(max-width: 768px) 100vw, 320px" priority categorySlug={category?.slug} />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">{category?.name ?? 'Spectacle'} · toutes les dates</p>
          <h1 className="font-display mt-1 text-[2.6rem] text-ink sm:text-[3.4rem]">{title}</h1>
          <p className="mt-2 text-[16px] text-text-secondary">
            {total} date{rows.length > 1 ? 's' : ''} à venir dans {groups.length} lieu{groups.length > 1 ? 'x' : ''}.
          </p>
          {text && (
            <div className="mt-4 max-w-[68ch] whitespace-pre-line text-[16px] leading-relaxed text-ink-soft">
              {text.length > 1200 ? text.slice(0, 1200).replace(/\s+\S*$/, '') + '…' : text}
            </div>
          )}
        </div>
      </div>

      {pinned.length > 0 && mapToken && (
        <section className="mt-10" aria-labelledby="map-title">
          <h2 id="map-title" className="font-display text-[1.8rem] text-ink">
            Où le voir
          </h2>
          <div className="relative mt-3 aspect-[9/4] w-full overflow-hidden rounded-xl bg-paper-deep">
            <Image
              src={staticMapUrl(pinned.map((g) => ({ lat: g.venue!.lat!, lng: g.venue!.lng! })), mapToken)}
              alt={`Plan des lieux : ${pinned.map((g, i) => `${i + 1}. ${g.venue!.name}`).join(', ')}`}
              fill
              unoptimized
              sizes="(max-width: 768px) 100vw, 720px"
              className="object-cover"
            />
          </div>
        </section>
      )}

      <section className="mt-10" aria-labelledby="dates-title">
        <h2 id="dates-title" className="font-display text-[1.8rem] text-ink">
          Les dates, lieu par lieu
        </h2>
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {groups.map((g) => {
            const pin = pinIndex.get(g.key)
            const price = priceLabel(g)
            const booking = safeUrl(g.bookingUrl)
            const shown = g.dates.slice(0, DATES_SHOWN)
            const rest = g.dates.slice(DATES_SHOWN)
            const chip = (d: WorkRow) => (
              <li key={d.id}>
                <Link
                  href={`/evenements/${d.slug}`}
                  className="inline-flex min-h-10 items-center rounded-full border border-border-strong bg-surface px-3 text-[14px] font-semibold text-ink transition-colors hover:border-ink"
                >
                  {formatWhen(d, now)}
                </Link>
              </li>
            )
            return (
              <li key={g.key} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="flex min-w-0 items-start gap-3">
                    {pin && (
                      <span
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-paper"
                        aria-label={`Repère ${pin} sur le plan`}
                      >
                        {pin}
                      </span>
                    )}
                    <div className="min-w-0">
                      {g.venue ? (
                        <Link href={`/lieux/${g.venue.slug}`} className="text-[17px] font-semibold text-ink hover:underline">
                          {g.venue.name}
                        </Link>
                      ) : (
                        <span className="text-[17px] font-semibold text-ink">Lieu non précisé</span>
                      )}
                      {g.venue?.signature && <SignatureBadge className="ml-2 align-middle" />}
                      {g.venue && (g.venue.address || g.venue.arrondissement || g.venue.city) && (
                        <p className="mt-0.5 flex items-center gap-1 text-[14px] text-text-secondary">
                          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span>{[g.venue.address, g.venue.arrondissement ?? g.venue.city].filter(Boolean).join(' · ')}</span>
                        </p>
                      )}
                      {price && <p className={'mt-0.5 text-[14px] font-semibold ' + (price === 'Gratuit' ? 'text-free' : 'text-ink')}>{price}</p>}
                    </div>
                  </div>
                  {booking && (
                    <OutboundLink
                      href={booking}
                      eventId={g.dates[0].id}
                      source={g.dates[0].source}
                      kind="booking"
                      className="inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-semibold text-paper transition-colors hover:bg-accent-hover"
                    >
                      {g.anyFree && !g.priceMax ? 'Infos & inscription' : 'Réserver'}
                      <ExternalLink className="h-4 w-4" aria-hidden />
                      <span className="sr-only">{g.venue ? ` à ${g.venue.name}` : ''} (nouvel onglet)</span>
                    </OutboundLink>
                  )}
                </div>
                <ul className="mt-3 flex flex-wrap gap-2" aria-label={`Dates${g.venue ? ` à ${g.venue.name}` : ''}`}>
                  {shown.map(chip)}
                </ul>
                {rest.length > 0 && (
                  <details className="mt-2">
                    <summary className="inline-flex h-10 cursor-pointer items-center text-[14px] font-semibold text-accent hover:underline">
                      Voir {rest.length === 1 ? 'l’autre date' : `les ${rest.length} autres dates`}
                    </summary>
                    <ul className="mt-2 flex flex-wrap gap-2">{rest.map(chip)}</ul>
                  </details>
                )}
              </li>
            )
          })}
        </ul>
        <p className="mt-6 text-[14px] text-text-secondary">
          Dates regroupées à partir de nos sources par titre identique. Horaires et tarifs peuvent changer : vérifie auprès de l’organisateur avant de te déplacer.
        </p>
      </section>
    </div>
  )
}
