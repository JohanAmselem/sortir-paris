import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { ArrowLeft, MapPin } from 'lucide-react'
import { EventCard } from '@/components/events/event-card'
import { FilterBar } from '@/components/search/filter-bar'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, desc, asc } from 'drizzle-orm'

interface Props {
  params: Promise<{ zone: string }>
}

const VALID_ZONES = [
  '1er', '2e', '3e', '4e', '5e', '6e', '7e', '8e', '9e', '10e',
  '11e', '12e', '13e', '14e', '15e', '16e', '17e', '18e', '19e', '20e',
]

function formatZoneLabel(zone: string): string {
  if (zone === '1er') return '1er arrondissement'
  return `${zone} arrondissement`
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { zone } = await params
  if (!VALID_ZONES.includes(zone)) return { title: 'Arrondissement introuvable' }

  return {
    title: `Sorties dans le ${formatZoneLabel(zone)} de Paris — Paname Club`,
    description: `Concerts, expos, spectacles, soirées dans le ${formatZoneLabel(zone)} de Paris. Trouvez votre sortie.`,
    alternates: { canonical: `/paris/${zone}` },
  }
}

async function getZoneData(zone: string) {
  const now = new Date()

  const [zoneEvents, allCategories] = await Promise.all([
    db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .innerJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(
        and(
          eq(events.status, 'active'),
          eq(venues.arrondissement, zone),
          gte(events.startDate, now)
        )
      )
      .orderBy(desc(events.qualityScore))
      .limit(48),
    db.select().from(categories).orderBy(asc(categories.position)),
  ])

  return { events: zoneEvents, categories: allCategories }
}

export default async function ZonePage({ params }: Props) {
  const { zone } = await params

  if (!VALID_ZONES.includes(zone)) notFound()

  const { events: zoneEvents, categories: cats } = await getZoneData(zone)

  return (
    <div className="px-4 py-6">
      {/* Back */}
      <Link href="/evenements" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-muted hover:text-text-primary transition-colors mb-4">
        <ArrowLeft className="h-3.5 w-3.5" />
        Explorer
      </Link>

      <div className="flex items-center gap-2">
        <MapPin className="h-5 w-5 text-accent" />
        <h1 className="text-2xl font-bold text-text-primary">
          {formatZoneLabel(zone)}
        </h1>
      </div>
      <p className="mt-1 text-sm text-text-secondary">
        {zoneEvents.length} événement{zoneEvents.length !== 1 ? 's' : ''} à venir
      </p>

      <div className="mt-4">
        <Suspense fallback={<div className="h-10" />}>
          <FilterBar categories={cats} />
        </Suspense>
      </div>

      {zoneEvents.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {zoneEvents.map((item) => (
            <EventCard key={item.event.id} event={{
              ...item.event,
              category: item.category,
              venue: item.venue,
              tags: [],
              ambiances: [],
            } as never} />
          ))}
        </div>
      ) : (
        <div className="mt-16 text-center">
          <p className="text-4xl">📍</p>
          <p className="mt-4 text-lg font-medium text-text-primary">
            Aucun événement dans le {formatZoneLabel(zone)}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Essayez un autre arrondissement ou revenez plus tard
          </p>
        </div>
      )}

      {/* Browse other arrondissements */}
      <div className="mt-12 border-t border-border/60 pt-8">
        <h2 className="text-[14px] font-bold text-text-primary mb-3">
          Autres arrondissements
        </h2>
        <div className="flex flex-wrap gap-2">
          {VALID_ZONES.filter((z) => z !== zone).map((z) => (
            <Link
              key={z}
              href={`/paris/${z}`}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-hover hover:border-border-strong transition-colors"
            >
              {z}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
