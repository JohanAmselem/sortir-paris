import { Metadata } from 'next'
import { Suspense } from 'react'
import { SearchBar } from '@/components/search/search-bar'
import { SectionRow } from '@/components/events/section-row'
import { FilterBar } from '@/components/search/filter-bar'
import Link from 'next/link'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, lte, desc, asc, sql } from 'drizzle-orm'

export const metadata: Metadata = {
  title: 'Paname Club — Sorties culturelles à Paris',
  description: 'Concerts, expos, spectacles, festivals — toute la culture parisienne en un clic.',
}

export const dynamic = 'force-dynamic'

async function getHomeData() {
  const now = new Date()
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)

  const nextWeek = new Date(now)
  nextWeek.setDate(now.getDate() + 7)

  const [tonight, upcoming, allCategories] = await Promise.all([
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
      .orderBy(desc(events.qualityScore))
      .limit(12),

    // Upcoming this week (for "A ne pas rater")
    db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(
        and(
          eq(events.status, 'active'),
          gte(events.startDate, now),
          lte(events.startDate, nextWeek)
        )
      )
      .orderBy(desc(events.qualityScore))
      .limit(12),

    db.select().from(categories).orderBy(asc(categories.position)),
  ])

  return { tonight, upcoming, categories: allCategories }
}

export default async function HomePage() {
  const { tonight, upcoming, categories: cats } = await getHomeData()

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-primary px-4 pb-10 pt-12">
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-accent/30" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--color-accent)_0%,_transparent_50%)] opacity-20" />

        <div className="relative z-10">
          <h1 className="text-center text-3xl font-black tracking-tight text-white md:text-5xl">
            <span className="gradient-text">Paname</span>{' '}
            <span className="text-white">Club</span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-center text-sm text-white/60 md:text-base">
            Concerts, expos, spectacles, festivals — toute la culture parisienne en un clic.
          </p>
          <SearchBar className="mx-auto mt-8 max-w-lg" />
        </div>
      </section>

      {/* Quick filters */}
      <div className="border-b border-border bg-surface px-4 py-3">
        <Suspense fallback={<div className="h-10" />}>
          <FilterBar categories={cats} />
        </Suspense>
      </div>

      {/* Ce soir */}
      {tonight.length > 0 && (
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
      )}

      {/* A ne pas rater */}
      {upcoming.length > 0 && (
        <SectionRow
          title="A ne pas rater"
          icon="🔥"
          href="/evenements"
          events={upcoming.map((r) => ({
            ...r.event,
            category: r.category,
            venue: r.venue,
            tags: [],
            ambiances: [],
          })) as never[]}
        />
      )}

      {/* Categories grid */}
      <section className="px-4 py-10 lg:px-0">
        <h2 className="text-xl font-bold text-text-primary">Explorer par catégorie</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          {cats.map((cat) => (
            <Link
              key={cat.slug}
              href={`/categories/${cat.slug}`}
              className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-accent/30"
            >
              <span className="text-2xl transition-transform group-hover:scale-110">{cat.icon}</span>
              <span className="text-sm font-semibold text-text-primary">{cat.name}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
