import { Metadata } from 'next'
import { Suspense } from 'react'
import { EventCard } from '@/components/events/event-card'
import { FilterBar } from '@/components/search/filter-bar'
import { SearchBar } from '@/components/search/search-bar'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, lte, desc, asc, sql } from 'drizzle-orm'

export const metadata: Metadata = {
  title: 'Explorer — Tous les événements',
  description: 'Parcourez tous les événements culturels à Paris. Filtrez par date, catégorie, prix.',
}

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ [key: string]: string | undefined }>
}

async function getEvents(searchParams: { [key: string]: string | undefined }) {
  const now = new Date()
  const conditions = [eq(events.status, 'active')]

  // Date filter
  if (searchParams.date === 'today') {
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)
    conditions.push(gte(events.startDate, now))
    conditions.push(lte(events.startDate, endOfDay))
  } else if (searchParams.date === 'weekend') {
    const dayOfWeek = now.getDay()
    const saturday = new Date(now)
    saturday.setDate(now.getDate() + (6 - dayOfWeek))
    saturday.setHours(0, 0, 0, 0)
    const sunday = new Date(saturday)
    sunday.setDate(saturday.getDate() + 1)
    sunday.setHours(23, 59, 59, 999)
    conditions.push(gte(events.startDate, saturday))
    conditions.push(lte(events.startDate, sunday))
  } else if (searchParams.date === 'week') {
    const endOfWeek = new Date(now)
    endOfWeek.setDate(now.getDate() + 7)
    conditions.push(gte(events.startDate, now))
    conditions.push(lte(events.startDate, endOfWeek))
  } else {
    // Default: future events
    conditions.push(gte(events.startDate, now))
  }

  // Category filter
  if (searchParams.category) {
    const cat = await db.query.categories?.findFirst({
      where: eq(categories.slug, searchParams.category),
    })
    if (cat) conditions.push(eq(events.categoryId, cat.id))
  }

  // Free filter
  if (searchParams.free === 'true') {
    conditions.push(eq(events.isFree, true))
  }

  const [eventsList, allCategories] = await Promise.all([
    db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(desc(events.qualityScore))
      .limit(48),
    db.select().from(categories).orderBy(asc(categories.position)),
  ])

  return { events: eventsList, categories: allCategories }
}

export default async function EvenementsPage({ searchParams }: Props) {
  const params = await searchParams
  const { events: eventsList, categories: cats } = await getEvents(params)

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold text-text-primary">Explorer</h1>
      <p className="mt-1 text-sm text-text-muted">
        {eventsList.length} événements trouvés
      </p>

      <div className="mt-4">
        <SearchBar className="max-w-lg" />
      </div>

      <div className="mt-4">
        <Suspense fallback={<div className="h-10" />}>
          <FilterBar categories={cats} />
        </Suspense>
      </div>

      {eventsList.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {eventsList.map((item) => (
            <EventCard
              key={item.event.id}
              event={{
                ...item.event,
                category: item.category,
                venue: item.venue,
                tags: [],
                ambiances: [],
              } as never}
            />
          ))}
        </div>
      ) : (
        <div className="mt-16 text-center">
          <p className="text-5xl">🔍</p>
          <p className="mt-4 text-lg font-semibold text-text-primary">
            Aucun événement trouvé
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Essayez avec d&apos;autres filtres
          </p>
        </div>
      )}
    </div>
  )
}
