import { Metadata } from 'next'
import { Suspense } from 'react'
import { EventCard } from '@/components/events/event-card'
import { FilterBar } from '@/components/search/filter-bar'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, desc, asc } from 'drizzle-orm'

export const metadata: Metadata = {
  title: 'Sorties gratuites à Paris — Expos, Concerts, Événements',
  description:
    'Les meilleurs événements gratuits à Paris. Concerts, expositions, festivals, visites. Sortez sans dépenser un centime.',
  alternates: { canonical: '/gratuit' },
}

export const dynamic = 'force-dynamic'

async function getFreeData() {
  const now = new Date()

  const [freeEvents, allCategories] = await Promise.all([
    db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(
        and(
          eq(events.status, 'active'),
          eq(events.isFree, true),
          gte(events.startDate, now)
        )
      )
      .orderBy(desc(events.qualityScore))
      .limit(48),
    db.select().from(categories).orderBy(asc(categories.position)),
  ])

  return { events: freeEvents, categories: allCategories }
}

export default async function GratuitPage() {
  const { events: freeEvents, categories: cats } = await getFreeData()

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold text-text-primary">Sorties gratuites</h1>
      <p className="mt-1 text-sm text-text-secondary">
        {freeEvents.length} événement{freeEvents.length !== 1 ? 's' : ''} gratuit{freeEvents.length !== 1 ? 's' : ''}
      </p>

      <div className="mt-4">
        <Suspense fallback={<div className="h-10" />}>
          <FilterBar categories={cats} />
        </Suspense>
      </div>

      {freeEvents.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {freeEvents.map((item) => (
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
          <p className="text-4xl">✨</p>
          <p className="mt-4 text-lg font-medium text-text-primary">
            Pas d&apos;événement gratuit pour le moment
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            De nouveaux bons plans sont ajoutés chaque jour
          </p>
        </div>
      )}
    </div>
  )
}
