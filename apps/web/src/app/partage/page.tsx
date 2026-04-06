import { Metadata } from 'next'
import { EventCard } from '@/components/events/event-card'
import { db, events, venues, categories } from '@sortir/db'
import { inArray, eq } from 'drizzle-orm'
import Link from 'next/link'
import { ArrowLeft, Share2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Sélection partagée — Paname Club',
  description: 'Découvrez cette sélection de sorties culturelles à Paris.',
}

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ [key: string]: string | undefined }>
}

async function getSharedEvents(ids: string[]) {
  if (ids.length === 0) return []

  return db
    .select({ event: events, venue: venues, category: categories })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(inArray(events.id, ids))
}

export default async function PartagePage({ searchParams }: Props) {
  const params = await searchParams
  const title = params.title ?? 'Ma sélection'
  const ids = params.ids?.split(',').filter(Boolean) ?? []

  const eventsList = await getSharedEvents(ids)

  return (
    <div className="px-4 py-6">
      <Link
        href="/evenements"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-muted hover:text-text-primary transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Explorer
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
          <Share2 className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
          <p className="text-[13px] text-text-muted">
            {eventsList.length} événement{eventsList.length !== 1 ? 's' : ''} dans cette sélection
          </p>
        </div>
      </div>

      {eventsList.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {eventsList.map((r) => (
            <EventCard
              key={r.event.id}
              event={{
                ...r.event,
                category: r.category,
                venue: r.venue,
                tags: [],
                ambiances: [],
              } as never}
            />
          ))}
        </div>
      ) : (
        <div className="mt-16 text-center">
          <p className="text-4xl">🔗</p>
          <p className="mt-3 text-lg font-medium text-text-primary">Lien invalide</p>
          <p className="mt-1 text-[13px] text-text-muted">
            Cette sélection n&apos;existe plus ou le lien est invalide.
          </p>
        </div>
      )}
    </div>
  )
}
