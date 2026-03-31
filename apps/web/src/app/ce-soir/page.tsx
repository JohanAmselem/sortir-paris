import { Metadata } from 'next'
import { Suspense } from 'react'
import { EventCard } from '@/components/events/event-card'
import { FilterBar } from '@/components/search/filter-bar'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, lte, desc, asc } from 'drizzle-orm'

export const metadata: Metadata = {
  title: 'Sortir ce soir à Paris — Concerts, Expos, Théâtre',
  description:
    'Tous les événements culturels ce soir à Paris. Concerts, expositions, théâtre, cinéma. Trouvez votre sortie en 30 secondes.',
  alternates: { canonical: '/ce-soir' },
}

export const dynamic = 'force-dynamic'

async function getTonightData() {
  const now = new Date()
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)

  const [tonightEvents, allCategories] = await Promise.all([
    db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(
        and(
          eq(events.status, 'active'),
          gte(events.startDate, now),
          lte(events.startDate, endOfDay)
        )
      )
      .orderBy(desc(events.saveCount))
      .limit(30),
    db.select().from(categories).orderBy(asc(categories.position)),
  ])

  return { events: tonightEvents, categories: allCategories }
}

export default async function CeSoirPage() {
  const { events: tonightEvents, categories: cats } = await getTonightData()

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold text-text-primary">Ce soir à Paris</h1>
      <p className="mt-1 text-sm text-text-secondary">
        {tonightEvents.length} événements ce soir
      </p>

      <div className="mt-4">
        <Suspense fallback={<div className="h-10" />}>
          <FilterBar categories={cats} />
        </Suspense>
      </div>

      {tonightEvents.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tonightEvents.map((item) => (
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
          <p className="text-4xl">🌙</p>
          <p className="mt-4 text-lg font-medium text-text-primary">
            Pas d&apos;événement ce soir
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Consultez les sorties du week-end
          </p>
        </div>
      )}
    </div>
  )
}
