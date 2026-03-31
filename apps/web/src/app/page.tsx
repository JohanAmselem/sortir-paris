import { Metadata } from 'next'
import { Suspense } from 'react'
import { SectionRow } from '@/components/events/section-row'
import { AISearchBox } from '@/components/search/ai-search-box'
import { FilterBar } from '@/components/search/filter-bar'
import Link from 'next/link'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, lte, desc, asc } from 'drizzle-orm'

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

  const [tonight, upcoming, free, allCategories] = await Promise.all([
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

    // Free events
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
      .limit(12),

    db.select().from(categories).orderBy(asc(categories.position)),
  ])

  return { tonight, upcoming, free, categories: allCategories }
}

function mapEvents(rows: Array<{ event: typeof events.$inferSelect; venue: typeof venues.$inferSelect | null; category: typeof categories.$inferSelect | null }>) {
  return rows.map((r) => ({
    ...r.event,
    category: r.category,
    venue: r.venue,
    tags: [],
    ambiances: [],
  })) as never[]
}

export default async function HomePage() {
  const { tonight, upcoming, free, categories: cats } = await getHomeData()

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-primary px-4 pb-16 pt-14 md:pb-20 md:pt-20">
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-accent/30" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--color-accent)_0%,_transparent_50%)] opacity-20" />
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-bg to-transparent" />

        <div className="relative z-10">
          <h1 className="text-center text-4xl font-black tracking-tight text-white md:text-6xl">
            <span className="gradient-text">Paname</span>{' '}
            <span className="text-white">Club</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-center text-base font-medium text-white/70 md:text-lg">
            L&apos;IA culturelle qui te trouve ton meilleur plan pour ce soir&nbsp;!
          </p>

          {/* AI Search — central feature */}
          <div className="mx-auto mt-10 max-w-xl">
            <AISearchBox />
          </div>
        </div>
      </section>

      {/* Quick filters */}
      <div className="sticky top-14 z-30 border-b border-border bg-surface/95 backdrop-blur-sm px-4 py-3">
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
          events={mapEvents(tonight)}
        />
      )}

      {/* A ne pas rater */}
      {upcoming.length > 0 && (
        <SectionRow
          title="A ne pas rater"
          icon="🔥"
          href="/evenements"
          events={mapEvents(upcoming)}
        />
      )}

      {/* Gratuit */}
      {free.length > 0 && (
        <SectionRow
          title="Bons plans gratuits"
          icon="🆓"
          href="/evenements?free=true"
          events={mapEvents(free)}
        />
      )}

      {/* Categories grid */}
      <section className="px-4 py-10">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-text-primary">Explorer par catégorie</h2>
          <Link href="/evenements" className="text-sm font-medium text-accent hover:text-accent-hover transition-colors">
            Tout voir
          </Link>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {cats.map((cat) => (
            <Link
              key={cat.slug}
              href={`/categories/${cat.slug}`}
              className="group relative flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-surface p-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-1 hover:border-accent/30"
            >
              <span className="text-3xl transition-transform duration-200 group-hover:scale-110">{cat.icon}</span>
              <span className="text-[13px] font-semibold text-text-primary">{cat.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section className="mx-4 mb-10 overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-accent/80 p-8 text-center md:p-12">
        <h2 className="text-xl font-bold text-white md:text-2xl">
          Ne rate plus aucune sortie
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
          Crée ton compte, dis-nous ce que tu aimes, et on te trouve les meilleurs plans chaque jour.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-sm font-bold text-primary shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]"
        >
          Rejoindre le club
        </Link>
      </section>
    </div>
  )
}
