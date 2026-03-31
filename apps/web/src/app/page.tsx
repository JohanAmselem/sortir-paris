import { Suspense } from 'react'
import { SectionRow } from '@/components/events/section-row'
import { EventCard } from '@/components/events/event-card'
import { AISearchBox } from '@/components/search/ai-search-box'
import { MoodSelector } from '@/components/ui/mood-selector'
import { BackToTop } from '@/components/ui/back-to-top'
import { SkeletonRow } from '@/components/ui/skeleton-card'
import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
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

  // Pick first 2 events as featured
  const featuredEvents = tonight.length > 0 ? tonight.slice(0, 2) : upcoming.slice(0, 2)
  const regularTonight = tonight.length > 2 ? tonight.slice(2) : tonight

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-primary px-4 pb-16 pt-12 md:pb-24 md:pt-20">
        {/* Background effects */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_-10%,_var(--color-accent),_transparent_60%)] opacity-20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_60%_at_90%_50%,_var(--color-neon),_transparent_60%)] opacity-8" />
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-bg to-transparent" />

        <div className="relative z-10 mx-auto max-w-2xl">
          <h1 className="text-center text-3xl font-black tracking-tight md:text-5xl">
            <span className="gradient-text">Paname</span>
            <span className="text-white"> Club</span>
          </h1>

          <p className="mx-auto mt-3 max-w-xs text-center text-[14px] leading-relaxed text-white/40 md:max-w-md md:text-[15px]">
            Dis-nous ce que tu veux, on te trouve la sortie parfaite
          </p>

          <div className="mt-8">
            <AISearchBox />
          </div>
        </div>
      </section>

      {/* Mood selector */}
      <section className="px-4 py-8">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-accent" />
          <h2 className="text-[14px] font-bold text-text-primary">J&apos;ai envie de...</h2>
        </div>
        <MoodSelector />
      </section>

      {/* Featured events */}
      {featuredEvents.length > 0 && (
        <section className="px-4 pb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
              <span>⭐</span> A la une
            </h2>
            <Link href="/ce-soir" className="flex items-center gap-1 text-[13px] font-medium text-accent hover:text-accent-hover transition-colors">
              Voir tout <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {featuredEvents.map((item) => (
              <EventCard
                key={item.event.id}
                event={{
                  ...item.event,
                  category: item.category,
                  venue: item.venue,
                  tags: [],
                  ambiances: [],
                } as never}
                variant="featured"
              />
            ))}
          </div>
        </section>
      )}

      {/* Event sections */}
      <Suspense fallback={<SkeletonRow />}>
        <div className="space-y-2">
          {regularTonight.length > 0 && (
            <SectionRow title="Ce soir" icon="🌙" href="/ce-soir" events={mapEvents(regularTonight)} />
          )}
          {upcoming.length > 0 && (
            <SectionRow title="Cette semaine" icon="🔥" href="/evenements" events={mapEvents(upcoming)} />
          )}
          {free.length > 0 && (
            <SectionRow title="Bons plans gratuits" icon="✨" href="/evenements?free=true" events={mapEvents(free)} />
          )}
        </div>
      </Suspense>

      {/* Categories */}
      <section className="px-4 py-10">
        <h2 className="text-lg font-bold text-text-primary">Explorer par catégorie</h2>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {cats.map((cat) => (
            <Link
              key={cat.slug}
              href={`/categories/${cat.slug}`}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-surface p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-accent/20 active:scale-[0.97]"
            >
              <span className="text-2xl transition-transform duration-200 group-hover:scale-110">{cat.icon}</span>
              <span className="text-[11px] font-semibold text-text-secondary group-hover:text-text-primary">{cat.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-4 mb-8 overflow-hidden rounded-2xl bg-primary relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_100%_at_0%_50%,_var(--color-accent),_transparent_60%)] opacity-15" />
        <div className="relative p-8 text-center md:p-10">
          <h2 className="text-lg font-bold text-white md:text-xl">
            Ne rate plus aucune sortie
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-white/35">
            Crée ton compte, dis-nous ce que tu aimes, et on te trouve les meilleurs plans chaque jour.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-2.5 text-[13px] font-bold text-primary transition-all hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]"
          >
            Rejoindre le club
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      <BackToTop />
    </div>
  )
}
