import { Suspense } from 'react'
import { SectionRow } from '@/components/events/section-row'
import { AISearchBox } from '@/components/search/ai-search-box'
import { FilterBar } from '@/components/search/filter-bar'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, lte, desc, asc } from 'drizzle-orm'

export const metadata = {
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
      .where(and(eq(events.status, 'active'), gte(events.startDate, now), lte(events.startDate, endOfDay)))
      .orderBy(desc(events.qualityScore))
      .limit(12),
    db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(eq(events.status, 'active'), gte(events.startDate, now), lte(events.startDate, nextWeek)))
      .orderBy(desc(events.qualityScore))
      .limit(12),
    db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(eq(events.status, 'active'), eq(events.isFree, true), gte(events.startDate, now)))
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
      <section className="relative overflow-hidden bg-primary px-4 pb-20 pt-16 md:pb-28 md:pt-24">
        {/* Background layers */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,_var(--color-accent),_transparent_70%)] opacity-15" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_80%_at_80%_50%,_var(--color-neon),_transparent_70%)] opacity-8" />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-bg to-transparent" />

        <div className="relative z-10 mx-auto max-w-2xl">
          {/* Logo */}
          <h1 className="text-center text-4xl font-black tracking-tight md:text-6xl">
            <span className="gradient-text">Paname</span>
            <span className="text-white"> Club</span>
          </h1>

          {/* Tagline */}
          <p className="mx-auto mt-4 max-w-sm text-center text-[15px] leading-relaxed text-white/50 md:text-base">
            L&apos;IA culturelle qui te trouve ton meilleur plan pour ce soir
          </p>

          {/* AI Search */}
          <div className="mt-10">
            <AISearchBox />
          </div>
        </div>
      </section>

      {/* Sticky filters */}
      <div className="sticky top-14 z-30 border-b border-border/50 bg-white/80 backdrop-blur-xl px-4 py-2.5">
        <Suspense fallback={<div className="h-9" />}>
          <FilterBar categories={cats} />
        </Suspense>
      </div>

      {/* Content sections */}
      <div className="space-y-2">
        {tonight.length > 0 && (
          <SectionRow title="Ce soir" icon="🌙" href="/ce-soir" events={mapEvents(tonight)} />
        )}

        {upcoming.length > 0 && (
          <SectionRow title="A ne pas rater" icon="🔥" href="/evenements" events={mapEvents(upcoming)} />
        )}

        {free.length > 0 && (
          <SectionRow title="Bons plans gratuits" icon="✨" href="/evenements?free=true" events={mapEvents(free)} />
        )}
      </div>

      {/* Categories */}
      <section className="px-4 py-12">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">Explorer par catégorie</h2>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
          {cats.map((cat) => (
            <Link
              key={cat.slug}
              href={`/categories/${cat.slug}`}
              className="group flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-accent/20"
            >
              <span className="text-2xl transition-transform duration-200 group-hover:scale-110">{cat.icon}</span>
              <span className="text-[12px] font-semibold text-text-primary">{cat.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-4 mb-8 rounded-2xl bg-primary p-8 text-center md:p-10">
        <h2 className="text-lg font-bold text-white md:text-xl">
          Ne rate plus aucune sortie
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-white/40">
          Crée ton compte, dis-nous ce que tu aimes, et on te trouve les meilleurs plans chaque jour.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-2.5 text-[13px] font-bold text-primary transition-all hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]"
        >
          Rejoindre le club
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </section>
    </div>
  )
}
