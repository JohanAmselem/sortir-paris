import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound, permanentRedirect } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { PageIntro } from '@/components/events/listing'
import { DataUnavailable, EmptyState, EventGrid } from '@/components/events/blocks'
import { LoadMore } from '@/components/events/load-more'
import { SignatureBadge } from '@/components/events/signature-badge'
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
  const page = await safeQueryEvents({ venueSlug: slug, sort: 'soon', limit: 24 })
  const mapToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const hasGeo = venue.lat != null && venue.lng != null
  const website = safeUrl(venue.website)

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

  return (
    <div className="px-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(placeLd) }} />
      <PageIntro kicker={venue.arrondissement ? `Paris ${venue.arrondissement}` : venue.city} title={venue.name}>
        {isSignatureVenue(venue.name) && <SignatureBadge className="mb-2" />}
        <p>{[venue.address, [venue.zipCode, venue.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</p>
        <div className="mt-2 flex flex-wrap gap-x-5">
          {hasGeo && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${venue.lat},${venue.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center text-[15px] font-semibold text-accent hover:underline"
            >
              Itinéraire
            </a>
          )}
          {hasGeo && (
            <a href={`/carte?lat=${venue.lat}&lng=${venue.lng}&zoom=15`} className="inline-flex h-11 items-center text-[15px] font-semibold text-accent hover:underline">
              Autour de ce lieu
            </a>
          )}
          {website && (
            <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-1.5 text-[15px] font-semibold text-accent hover:underline">
              Site du lieu <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          )}
        </div>
        <FollowButton target={{ kind: 'venue', venueId: venue.id }} label="Suivre ce lieu" className="mt-3 items-start" />
      </PageIntro>

      {hasGeo && mapToken && (
        <div className="relative mb-8 aspect-[3/1] overflow-hidden rounded-xl bg-paper-deep">
          <Image
            src={`https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-l+7c3aed(${venue.lng},${venue.lat})/${venue.lng},${venue.lat},14.5,0/960x320@2x?access_token=${mapToken}`}
            alt={`Plan d’accès à ${venue.name}`}
            fill
            unoptimized
            sizes="100vw"
            className="object-cover"
          />
        </div>
      )}

      <h2 className="font-display text-[2rem] text-ink">À l’affiche</h2>
      {page.error ? (
        <DataUnavailable className="mt-4" />
      ) : page.events.length === 0 ? (
        <EmptyState className="mt-4" title="Rien de programmé pour l’instant" actions={venue.arrondissement ? [{ href: `/paris/${venue.arrondissement}`, label: `Sortir dans le ${venue.arrondissement}` }] : [{ href: '/evenements', label: 'Toutes les sorties' }]}>
          Aucun événement à venir repéré dans nos sources pour ce lieu.
        </EmptyState>
      ) : (
        <>
          <EventGrid events={page.events} now={now} className="mt-5" dense />
          <LoadMore
            params={new URLSearchParams({ venue: slug, sort: 'soon' }).toString()}
            initialCount={page.events.length}
            total={page.total}
            nowIso={now.toISOString()}
            seenIds={page.events.map((e) => e.id)}
          />
        </>
      )}
    </div>
  )
}
