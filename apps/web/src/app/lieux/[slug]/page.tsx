import Link from 'next/link'
import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound, permanentRedirect } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { DataUnavailable, EmptyState, PageIntro } from '@/components/events/blocks'
import { DayList } from '@/components/events/day-list'
import { SignatureBadge } from '@/components/events/signature-badge'
import { staticMapUrl } from '@/lib/map-style'
import { FollowButton } from '@/components/follow/follow-button'
import { getVenueBySlug } from '@/lib/venues'
import { isSignatureVenue } from '@/lib/venues-signature'
import { bucketNow, safeQueryEvents } from '@/lib/events/query'
import { safeJsonLd } from '@/lib/json-ld'
import { safeUrl } from '@/lib/format'
import { absoluteUrl } from '@/lib/site'

export const revalidate = 1800

interface Props {
  params: Promise<{ slug: string }>
}

/** No pages at build time: each one is rendered on first visit, then cached (ISR). */
export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  // A database error must not be cached as "not found" / noindex: let it throw
  // (ISR keeps serving the previous version of the page).
  const v = await getVenueBySlug(slug)
  if (!v) return { title: 'Lieu introuvable', robots: { index: false } }
  const upcoming = await safeQueryEvents({ venueSlug: slug, limit: 1 })
  const where = v.arrondissement ? ` (${v.arrondissement})` : ''
  return {
    title: `${v.name}${where} : programme et prochains événements`,
    description: `Le programme de ${v.name}${v.address ? `, ${v.address}` : ''}${where} à Paris : concerts, spectacles et expositions à venir.`,
    alternates: { canonical: `/lieux/${v.canonicalSlug ?? v.slug}` },
    robots: !upcoming.error && upcoming.total === 0 ? { index: false, follow: true } : undefined,
  }
}

export default async function VenuePage({ params }: Props) {
  const { slug } = await params
  const venue = await getVenueBySlug(slug)
  if (!venue) notFound()
  if (venue.canonicalSlug && venue.canonicalSlug !== slug) permanentRedirect(`/lieux/${venue.canonicalSlug}`)

  const now = bucketNow()
  const page = await safeQueryEvents({ venueSlug: slug, sort: 'soon', limit: 30 })
  const mapToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const hasGeo = venue.lat != null && venue.lng != null
  const website = safeUrl(venue.website)
  const address = [venue.address, [venue.zipCode, venue.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')

  const placeLd = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: venue.name,
    url: absoluteUrl(`/lieux/${venue.slug}`),
    address: {
      '@type': 'PostalAddress',
      ...(venue.address ? { streetAddress: venue.address } : {}),
      addressLocality: venue.city || 'Paris',
      ...(venue.zipCode ? { postalCode: venue.zipCode } : {}),
      addressCountry: 'FR',
    },
    ...(hasGeo ? { geo: { '@type': 'GeoCoordinates', latitude: venue.lat, longitude: venue.lng } } : {}),
    ...(website ? { sameAs: [website] } : {}),
  }
  const link = 't-small inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline'

  return (
    <div className="px-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(placeLd) }} />
      <PageIntro kicker={venue.arrondissement ? `Paris ${venue.arrondissement}` : venue.city} title={venue.name}>
        {isSignatureVenue(venue.name) && <SignatureBadge className="mb-2" />}
        {address && <p>{address}</p>}
        <div className="mt-1 flex flex-wrap gap-x-5">
          {hasGeo && (
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${venue.lat},${venue.lng}`} target="_blank" rel="noopener noreferrer" className={link}>
              Itinéraire
            </a>
          )}
          {hasGeo && (
            <Link href={`/carte?lat=${venue.lat}&lng=${venue.lng}&zoom=15`} className={link}>
              Autour de ce lieu
            </Link>
          )}
          {website && (
            <a href={website} target="_blank" rel="noopener noreferrer" className={link}>
              Site du lieu <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <FollowButton target={{ kind: 'venue', venueId: venue.id, name: venue.name }} label="Suivre ce lieu" className="items-start" />
          <p className="t-small text-text-muted">Une alerte dès qu’une nouvelle date est annoncée.</p>
        </div>
      </PageIntro>

      {hasGeo && mapToken && (
        <div className="relative mb-8 aspect-[3/1] overflow-hidden rounded-2xl bg-surface">
          <Image src={staticMapUrl(venue.lat!, venue.lng!, '960x320', mapToken)} alt={`Plan d’accès à ${venue.name}`} fill unoptimized sizes="100vw" className="object-cover" />
        </div>
      )}

      <h2 className="t-title2 text-ink">
        À l’affiche{!page.error && page.total > 0 ? <span className="t-body ml-2 font-normal text-text-muted">{page.total.toLocaleString('fr-FR')} à venir</span> : null}
      </h2>
      {page.error ? (
        <DataUnavailable className="mt-4" />
      ) : page.events.length === 0 ? (
        <EmptyState
          className="mt-4"
          title="Rien de programmé pour l’instant"
          actions={venue.arrondissement ? [{ href: `/paris/${venue.arrondissement}`, label: `Sortir dans le ${venue.arrondissement}` }] : [{ href: '/agenda', label: 'Tout l’agenda' }]}
        >
          Aucune sortie à venir repérée dans nos sources pour ce lieu.
        </EmptyState>
      ) : (
        <DayList
          className="mt-1"
          endpoint="events"
          initial={page.events}
          nextOffset={page.hasMore ? page.events.length : null}
          params={new URLSearchParams({ venue: slug, sort: 'soon' }).toString()}
          nowIso={now.toISOString()}
        />
      )}
    </div>
  )
}
