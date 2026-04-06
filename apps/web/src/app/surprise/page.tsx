import { Metadata } from 'next'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, asc, sql } from 'drizzle-orm'
import { SurpriseCard } from './surprise-card'
import { SurpriseFilters } from './surprise-filters'

export const metadata: Metadata = {
  title: 'Surprise moi — Paname Club',
  description: 'Laisse le hasard décider. Découvre un événement culturel à Paris choisi pour toi.',
  alternates: { canonical: '/surprise' },
}

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ [key: string]: string | undefined }>
}

async function getRandomEvent(filters: { category?: string; free?: string; tonight?: string }) {
  const now = new Date()

  const conditions = [
    eq(events.status, 'active'),
    gte(events.startDate, now),
  ]

  if (filters.category) {
    const cat = await db.query.categories?.findFirst({
      where: eq(categories.slug, filters.category),
    })
    if (cat) conditions.push(eq(events.categoryId, cat.id))
  }

  if (filters.free === '1') {
    conditions.push(eq(events.isFree, true))
  }

  if (filters.tonight === '1') {
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)
    const { lte } = await import('drizzle-orm')
    conditions.push(lte(events.startDate, endOfDay))
  }

  const results = await db
    .select({ event: events, venue: venues, category: categories })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(sql`RANDOM()`)
    .limit(1)

  if (results.length === 0) return null

  const { event, venue, category } = results[0]
  return {
    ...event,
    venue,
    category,
    tags: [] as { slug: string; name: string }[],
    ambiances: [] as { slug: string; name: string; emoji: string | null }[],
  }
}

export default async function SurprisePage({ searchParams }: Props) {
  const params = await searchParams
  const event = await getRandomEvent({
    category: params.category,
    free: params.free,
    tonight: params.tonight,
  })

  const allCategories = await db.select().from(categories).orderBy(asc(categories.position))

  return (
    <div className="flex min-h-[70vh] flex-col items-center px-4 py-8">
      <div className="text-center">
        <h1 className="text-4xl font-black text-text-primary">
          🎲 Surprise !
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          On a choisi un événement au hasard pour toi
        </p>
      </div>

      {/* Filters */}
      <SurpriseFilters
        categories={allCategories}
        activeCategory={params.category}
        activeFree={params.free === '1'}
        activeTonight={params.tonight === '1'}
      />

      {event ? (
        <SurpriseCard event={event as never} />
      ) : (
        <div className="mt-12 text-center">
          <p className="text-5xl">😢</p>
          <p className="mt-4 text-lg font-medium text-text-primary">
            Aucun événement trouvé
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Essaie avec moins de filtres
          </p>
        </div>
      )}
    </div>
  )
}
