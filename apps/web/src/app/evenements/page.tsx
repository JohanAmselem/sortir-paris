import { Metadata } from 'next'
import { Suspense } from 'react'
import { EventCard } from '@/components/events/event-card'
import { FilterBar } from '@/components/search/filter-bar'
import { SearchBar } from '@/components/search/search-bar'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, lte, desc, asc, sql } from 'drizzle-orm'
import { aiSearch, type AIFilters } from '@/lib/ai-search'

export const metadata: Metadata = {
  title: 'Explorer — Tous les événements',
  description: 'Parcourez tous les événements culturels à Paris. Filtrez par date, catégorie, prix.',
}

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ [key: string]: string | undefined }>
}

async function getEvents(searchParams: { [key: string]: string | undefined }) {
  const now = new Date()
  const conditions = [eq(events.status, 'active')]

  // Date filter
  if (searchParams.date === 'today') {
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)
    conditions.push(gte(events.startDate, now))
    conditions.push(lte(events.startDate, endOfDay))
  } else if (searchParams.date === 'weekend') {
    const dayOfWeek = now.getDay()
    const saturday = new Date(now)
    saturday.setDate(now.getDate() + (6 - dayOfWeek))
    saturday.setHours(0, 0, 0, 0)
    const sunday = new Date(saturday)
    sunday.setDate(saturday.getDate() + 1)
    sunday.setHours(23, 59, 59, 999)
    conditions.push(gte(events.startDate, saturday))
    conditions.push(lte(events.startDate, sunday))
  } else if (searchParams.date === 'week') {
    const endOfWeek = new Date(now)
    endOfWeek.setDate(now.getDate() + 7)
    conditions.push(gte(events.startDate, now))
    conditions.push(lte(events.startDate, endOfWeek))
  } else {
    // Default: future events
    conditions.push(gte(events.startDate, now))
  }

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

  const [eventsList, allCategories] = await Promise.all([
    db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(desc(events.qualityScore))
      .limit(48),
    db.select().from(categories).orderBy(asc(categories.position)),
  ])

  return { events: eventsList, categories: allCategories }
}

const CATEGORY_ICONS: Record<string, string> = {
  concert: '🎵',
  expo: '🎨',
  theatre: '🎭',
  cinema: '🎬',
  festival: '🎪',
  conference: '🎤',
  danse: '💃',
  spectacle: '🎪',
  atelier: '🛠️',
  visite: '🏛️',
}

const DATE_LABELS: Record<string, string> = {
  today: "Aujourd'hui",
  weekend: 'Ce week-end',
  week: 'Cette semaine',
}

function AIFilterPills({ filters, query }: { filters: AIFilters; query: string }) {
  const pills: Array<{ icon: string; label: string }> = []

  if (filters.category) {
    const icon = CATEGORY_ICONS[filters.category] || '📌'
    pills.push({
      icon,
      label: filters.category.charAt(0).toUpperCase() + filters.category.slice(1),
    })
  }

  if (filters.arrondissements && filters.arrondissements.length > 0) {
    const arrLabel = filters.arrondissements.length === 1
      ? `${filters.arrondissements[0]} arr.`
      : filters.arrondissements.join(', ') + ' arr.'
    pills.push({ icon: '📍', label: arrLabel })
  }

  if (filters.isFree === true) {
    pills.push({ icon: '💰', label: 'Gratuit' })
  }

  if (filters.specificDate) {
    const date = new Date(filters.specificDate)
    const formatted = date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
    })
    pills.push({ icon: '📅', label: formatted })
  } else if (filters.dateFilter) {
    pills.push({
      icon: '📅',
      label: DATE_LABELS[filters.dateFilter] || filters.dateFilter,
    })
  }

  if (filters.keywords.length > 0) {
    pills.push({ icon: '🔑', label: filters.keywords.join(', ') })
  }

  if (pills.length === 0) return null

  return (
    <div className="mt-3 rounded-lg border border-accent/20 bg-accent/5 p-3">
      <p className="mb-2 text-xs font-medium text-text-muted">
        Recherche IA pour &laquo;&nbsp;{query}&nbsp;&raquo; :
      </p>
      <div className="flex flex-wrap gap-2">
        {pills.map((pill, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-xs font-medium text-text-primary shadow-sm border border-border"
          >
            <span>{pill.icon}</span>
            {pill.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export default async function EvenementsPage({ searchParams }: Props) {
  const params = await searchParams
  const isAI = params.ai === '1' && params.q && params.q.trim().length >= 3

  let eventsList: Awaited<ReturnType<typeof getEvents>>['events'] = []
  let cats: Awaited<ReturnType<typeof getEvents>>['categories'] = []
  let aiFilters: AIFilters | null = null
  let aiError = false

  if (isAI) {
    try {
      const result = await aiSearch(params.q!)
      aiFilters = result.filters
      eventsList = result.events

      // Still fetch categories for the filter bar
      cats = await db
        .select()
        .from(categories)
        .orderBy(asc(categories.position))
    } catch (error) {
      console.error('[AI Search Page] Error:', error)
      aiError = true
      // Fall back to normal search
      const normalResult = await getEvents(params)
      eventsList = normalResult.events
      cats = normalResult.categories
    }
  } else {
    const normalResult = await getEvents(params)
    eventsList = normalResult.events
    cats = normalResult.categories
  }

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            {isAI ? 'Résultats' : 'Explorer'}
          </h1>
          <p className="mt-0.5 text-[13px] text-text-muted">
            {eventsList.length} événement{eventsList.length !== 1 ? 's' : ''} trouvé{eventsList.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="mt-4">
        <SearchBar className="max-w-lg" />
      </div>

      {/* AI error */}
      {aiError && (
        <div className="mt-3 rounded-lg border border-yellow-200/80 bg-yellow-50 px-4 py-2.5 text-[13px] text-yellow-700">
          La recherche IA n&apos;a pas pu analyser ta demande. Voici les résultats classiques.
        </div>
      )}

      {/* AI filter pills */}
      {aiFilters && params.q && (
        <AIFilterPills filters={aiFilters} query={params.q} />
      )}

      {/* Filters */}
      <div className="mt-4">
        <Suspense fallback={<div className="h-9" />}>
          <FilterBar categories={cats} />
        </Suspense>
      </div>

      {/* Results grid */}
      {eventsList.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {eventsList.map((item) => (
            <EventCard
              key={item.event.id}
              event={{
                ...item.event,
                category: item.category,
                venue: item.venue,
                tags: [],
                ambiances: [],
              } as never}
            />
          ))}
        </div>
      ) : (
        <div className="mt-20 text-center">
          <p className="text-5xl">🔍</p>
          <p className="mt-4 text-lg font-bold text-text-primary">
            Aucun événement trouvé
          </p>
          <p className="mt-1 text-[13px] text-text-muted">
            {isAI
              ? 'Essaie de reformuler ta recherche'
              : "Essaie avec d'autres filtres"}
          </p>
        </div>
      )}
    </div>
  )
}
