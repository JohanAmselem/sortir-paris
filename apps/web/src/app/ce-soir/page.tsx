import { Metadata } from 'next'
import { Suspense } from 'react'
import { EventCard } from '@/components/events/event-card'
import { InfiniteEventGrid } from '@/components/events/infinite-event-grid'
import { FilterBar } from '@/components/search/filter-bar'
import { SearchBar } from '@/components/search/search-bar'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, lte, desc, asc, count } from 'drizzle-orm'

export const metadata: Metadata = {
  title: 'Sortir ce soir à Paris — Concerts, Expos, Théâtre',
  description:
    'Tous les événements culturels ce soir à Paris. Concerts, expositions, théâtre, cinéma. Trouvez votre sortie en 30 secondes.',
  alternates: { canonical: '/ce-soir' },
}

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ [key: string]: string | undefined }>
}

async function getTonightData(searchParams: { [key: string]: string | undefined }) {
  const now = new Date()
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)

  const conditions = [
    eq(events.status, 'active'),
    gte(events.startDate, now),
    lte(events.startDate, endOfDay),
  ]

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

  const tonightCondition = and(...conditions)

  const [tonightEvents, allCategories, totalCount] = await Promise.all([
    db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(tonightCondition)
      .orderBy(desc(events.saveCount))
      .limit(48),
    db.select().from(categories).orderBy(asc(categories.position)),
    db.select({ value: count() }).from(events).where(tonightCondition),
  ])

  return { events: tonightEvents, categories: allCategories, total: Number(totalCount[0].value) }
}

export default async function CeSoirPage({ searchParams }: Props) {
  const params = await searchParams
  const { events: tonightEvents, categories: cats, total } = await getTonightData(params)

  const apiParams: Record<string, string> = { date: 'today' }
  if (params.category) apiParams.category = params.category
  if (params.free === 'true') apiParams.free = 'true'

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold text-text-primary">Ce soir à Paris</h1>
      <p className="mt-1 text-sm text-text-secondary">
        {total} événement{total !== 1 ? 's' : ''} ce soir
      </p>

      <div className="mt-3">
        <SearchBar className="max-w-lg" />
      </div>

      <div className="mt-4">
        <Suspense fallback={<div className="h-10" />}>
          <FilterBar categories={cats} />
        </Suspense>
      </div>

      {tonightEvents.length > 0 ? (
        <div className="mt-6">
          <InfiniteEventGrid
            initialEvents={tonightEvents.map((item) => ({
              ...item.event,
              category: item.category,
              venue: item.venue,
              tags: [],
              ambiances: [],
            } as never))}
            apiParams={apiParams}
            sort="popular"
          />
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
