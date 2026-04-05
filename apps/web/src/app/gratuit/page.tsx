import { Metadata } from 'next'
import { Suspense } from 'react'
import { EventCard } from '@/components/events/event-card'
import { InfiniteEventGrid } from '@/components/events/infinite-event-grid'
import { FilterBar } from '@/components/search/filter-bar'
import { SearchBar } from '@/components/search/search-bar'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, lte, desc, asc, count } from 'drizzle-orm'

export const metadata: Metadata = {
  title: 'Sorties gratuites à Paris — Expos, Concerts, Événements',
  description:
    'Les meilleurs événements gratuits à Paris. Concerts, expositions, festivals, visites. Sortez sans dépenser un centime.',
  alternates: { canonical: '/gratuit' },
}

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ [key: string]: string | undefined }>
}

async function getFreeData(searchParams: { [key: string]: string | undefined }) {
  const now = new Date()

  const conditions = [
    eq(events.status, 'active'),
    eq(events.isFree, true),
    gte(events.startDate, now),
  ]

  // Category filter
  if (searchParams.category) {
    const cat = await db.query.categories?.findFirst({
      where: eq(categories.slug, searchParams.category),
    })
    if (cat) conditions.push(eq(events.categoryId, cat.id))
  }

  // Date filter
  if (searchParams.date === 'today') {
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)
    conditions.push(lte(events.startDate, endOfDay))
  } else if (searchParams.date === 'weekend') {
    const dayOfWeek = now.getDay()
    const saturday = new Date(now)
    if (dayOfWeek === 0) saturday.setDate(now.getDate() - 1)
    else if (dayOfWeek !== 6) saturday.setDate(now.getDate() + (6 - dayOfWeek))
    saturday.setHours(0, 0, 0, 0)
    const sunday = new Date(saturday)
    sunday.setDate(saturday.getDate() + 1)
    sunday.setHours(23, 59, 59, 999)
    conditions.push(gte(events.startDate, saturday))
    conditions.push(lte(events.startDate, sunday))
  } else if (searchParams.date === 'week') {
    const endOfWeek = new Date(now)
    endOfWeek.setDate(now.getDate() + 7)
    conditions.push(lte(events.startDate, endOfWeek))
  } else if (searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)) {
    const target = new Date(searchParams.date + 'T00:00:00')
    const endOfTarget = new Date(searchParams.date + 'T23:59:59.999')
    conditions.push(gte(events.startDate, target))
    conditions.push(lte(events.startDate, endOfTarget))
  }

  const freeCondition = and(...conditions)

  const [freeEvents, allCategories, totalCount] = await Promise.all([
    db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(freeCondition)
      .orderBy(desc(events.qualityScore))
      .limit(48),
    db.select().from(categories).orderBy(asc(categories.position)),
    db.select({ value: count() }).from(events).where(freeCondition),
  ])

  return { events: freeEvents, categories: allCategories, total: Number(totalCount[0].value) }
}

export default async function GratuitPage({ searchParams }: Props) {
  const params = await searchParams
  const { events: freeEvents, categories: cats, total } = await getFreeData(params)

  const apiParams: Record<string, string> = { free: 'true' }
  if (params.category) apiParams.category = params.category
  if (params.date) apiParams.date = params.date

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold text-text-primary">Sorties gratuites</h1>
      <p className="mt-1 text-sm text-text-secondary">
        {total.toLocaleString('fr-FR')} événement{total !== 1 ? 's' : ''} gratuit{total !== 1 ? 's' : ''}
      </p>

      <div className="mt-3">
        <SearchBar className="max-w-lg" />
      </div>

      <div className="mt-4">
        <Suspense fallback={<div className="h-10" />}>
          <FilterBar categories={cats} />
        </Suspense>
      </div>

      {freeEvents.length > 0 ? (
        <div className="mt-6">
          <InfiniteEventGrid
            initialEvents={freeEvents.map((item) => ({
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
