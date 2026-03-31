import { Metadata } from 'next'
import { Suspense } from 'react'
import { SearchBar } from '@/components/search/search-bar'
import { SectionRow } from '@/components/events/section-row'
import { FilterBar } from '@/components/search/filter-bar'
import Link from 'next/link'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, lte, desc, asc, sql } from 'drizzle-orm'

export const metadata: Metadata = {
  title: 'Sortir — Tous les événements culturels à Paris',
}

export const dynamic = 'force-dynamic'

async function getHomeData() {
  const now = new Date()
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)

  const [tonight, trending, allCategories] = await Promise.all([
    // Tonight's events
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
      .orderBy(desc(events.startDate))
      .limit(10),

    // Trending events
    db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(eq(events.status, 'active'))
      .orderBy(desc(events.saveCount))
      .limit(10),

    // All categories
    db.select().from(categories).orderBy(asc(categories.position)),
  ])

  return {
    tonight,
    trending,
    categories: allCategories,
  }
}

export default async function HomePage() {
  const { tonight, trending, categories: cats } = await getHomeData()

  return (
    <div>
      {/* Hero */}
      <section className="bg-primary px-4 pb-8 pt-10 text-white">
        <h1 className="text-center text-2xl font-bold md:text-4xl">
          Trouve ta sortie à Paris
        </h1>
        <p className="mt-2 text-center text-sm text-white/70 md:text-base">
          Concerts, expos, théâtre, cinéma — tout est là.
        </p>
        <SearchBar className="mx-auto mt-6 max-w-xl" />
      </section>

      {/* Quick filters */}
      <div className="border-b border-border bg-surface px-4 py-3">
        <Suspense fallback={<div className="h-10" />}>
          <FilterBar categories={cats} />
        </Suspense>
      </div>

      {/* Ce soir */}
      <SectionRow
        title="Ce soir"
        icon="🌙"
        href="/ce-soir"
        events={tonight.map((r) => ({
          ...r.event,
          category: r.category,
          venue: r.venue,
          tags: [],
          ambiances: [],
        })) as never[]}
      />

      {/* Tendances */}
      <SectionRow
        title="Tendances"
        icon="🔥"
        href="/evenements?sort=popular"
        events={trending.map((r) => ({
          ...r.event,
          category: r.category,
          venue: r.venue,
          tags: [],
          ambiances: [],
        })) as never[]}
      />

      {/* Categories grid */}
      <section className="px-4 py-8 lg:px-0">
        <h2 className="text-xl font-bold text-text-primary">Par catégorie</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          {cats.map((cat) => (
            <Link
              key={cat.slug}
              href={`/categories/${cat.slug}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              <span className="text-2xl">{cat.icon}</span>
              <span className="text-sm font-medium text-text-primary">{cat.name}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
