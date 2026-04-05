import { Metadata } from 'next'
import { Suspense } from 'react'
import { EventCard } from '@/components/events/event-card'
import { InfiniteEventGrid } from '@/components/events/infinite-event-grid'
import { FilterBar } from '@/components/search/filter-bar'
import { SearchBar } from '@/components/search/search-bar'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, lte, desc, asc, count } from 'drizzle-orm'

export const metadata: Metadata = {
  title: 'Ce week-end à Paris — Concerts, Expos, Spectacles',
  description:
    'Tous les événements culturels ce week-end à Paris. Concerts, expositions, théâtre, soirées. Trouvez votre sortie du samedi ou dimanche.',
  alternates: { canonical: '/ce-week-end' },
}

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ [key: string]: string | undefined }>
}

async function getWeekendData(searchParams: { [key: string]: string | undefined }) {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon, ..., 6=Sat

  // Calculate next Saturday (or today if Saturday/Sunday)
  const saturday = new Date(now)
  if (dayOfWeek === 0) {
    // Sunday: show today
    saturday.setDate(now.getDate() - 1)
  } else if (dayOfWeek === 6) {
    // Saturday: show today
  } else {
    saturday.setDate(now.getDate() + (6 - dayOfWeek))
  }
  saturday.setHours(0, 0, 0, 0)

  const sunday = new Date(saturday)
  sunday.setDate(saturday.getDate() + 1)
  sunday.setHours(23, 59, 59, 999)

  const conditions = [
    eq(events.status, 'active'),
    gte(events.startDate, saturday),
    lte(events.startDate, sunday),
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

  const weekendCondition = and(...conditions)

  const [weekendEvents, allCategories, totalCount] = await Promise.all([
    db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(weekendCondition)
      .orderBy(desc(events.qualityScore))
      .limit(48),
    db.select().from(categories).orderBy(asc(categories.position)),
    db.select({ value: count() }).from(events).where(weekendCondition),
  ])

  return { events: weekendEvents, categories: allCategories, total: Number(totalCount[0].value) }
}

export default async function WeekEndPage({ searchParams }: Props) {
  const params = await searchParams
  const { events: weekendEvents, categories: cats, total } = await getWeekendData(params)

  const apiParams: Record<string, string> = { date: 'weekend' }
  if (params.category) apiParams.category = params.category
  if (params.free === 'true') apiParams.free = 'true'

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold text-text-primary">Ce week-end à Paris</h1>
      <p className="mt-1 text-sm text-text-secondary">
        {total.toLocaleString('fr-FR')} événement{total !== 1 ? 's' : ''} ce week-end
      </p>

      <div className="mt-3">
        <SearchBar className="max-w-lg" />
      </div>

      <div className="mt-4">
        <Suspense fallback={<div className="h-10" />}>
          <FilterBar categories={cats} />
        </Suspense>
      </div>

      {weekendEvents.length > 0 ? (
        <div className="mt-6">
          <InfiniteEventGrid
            initialEvents={weekendEvents.map((item) => ({
              ...item.event,
              category: item.category,
              venue: item.venue,
              tags: [],
              ambiances: [],
            } as never))}
            apiParams={apiParams}
            sort="quality"
          />
        </div>
      ) : (
        <div className="mt-16 text-center">
          <p className="text-4xl">📅</p>
          <p className="mt-4 text-lg font-medium text-text-primary">
            Pas encore d&apos;événement ce week-end
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Reviens bientôt, de nouveaux événements sont ajoutés chaque jour
          </p>
        </div>
      )}
    </div>
  )
}
