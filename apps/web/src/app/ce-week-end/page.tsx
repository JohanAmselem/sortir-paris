import { Metadata } from 'next'
import { Suspense } from 'react'
import { EventCard } from '@/components/events/event-card'
import { FilterBar } from '@/components/search/filter-bar'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, lte, desc, asc } from 'drizzle-orm'

export const metadata: Metadata = {
  title: 'Ce week-end à Paris — Concerts, Expos, Spectacles',
  description:
    'Tous les événements culturels ce week-end à Paris. Concerts, expositions, théâtre, soirées. Trouvez votre sortie du samedi ou dimanche.',
  alternates: { canonical: '/ce-week-end' },
}

export const dynamic = 'force-dynamic'

async function getWeekendData() {
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

  const [weekendEvents, allCategories] = await Promise.all([
    db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(
        and(
          eq(events.status, 'active'),
          gte(events.startDate, saturday),
          lte(events.startDate, sunday)
        )
      )
      .orderBy(desc(events.qualityScore))
      .limit(48),
    db.select().from(categories).orderBy(asc(categories.position)),
  ])

  return { events: weekendEvents, categories: allCategories }
}

export default async function WeekEndPage() {
  const { events: weekendEvents, categories: cats } = await getWeekendData()

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold text-text-primary">Ce week-end à Paris</h1>
      <p className="mt-1 text-sm text-text-secondary">
        {weekendEvents.length} événement{weekendEvents.length !== 1 ? 's' : ''} ce week-end
      </p>

      <div className="mt-4">
        <Suspense fallback={<div className="h-10" />}>
          <FilterBar categories={cats} />
        </Suspense>
      </div>

      {weekendEvents.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {weekendEvents.map((item) => (
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
