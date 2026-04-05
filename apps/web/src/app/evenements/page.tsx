import { Metadata } from 'next'
import { Suspense } from 'react'
import { InfiniteEventGrid } from '@/components/events/infinite-event-grid'
import { EventCard } from '@/components/events/event-card'
import { FilterBar } from '@/components/search/filter-bar'
import { SearchBar } from '@/components/search/search-bar'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, lte, desc, asc, sql, count } from 'drizzle-orm'
import { aiSearch, type AIIntent, type SearchResult } from '@/lib/ai-search'

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
  } else if (searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)) {
    const target = new Date(searchParams.date + 'T00:00:00')
    const endOfTarget = new Date(searchParams.date + 'T23:59:59.999')
    conditions.push(gte(events.startDate, target))
    conditions.push(lte(events.startDate, endOfTarget))
  } else {
    conditions.push(gte(events.startDate, now))
  }

  if (searchParams.category) {
    const cat = await db.query.categories?.findFirst({
      where: eq(categories.slug, searchParams.category),
    })
    if (cat) conditions.push(eq(events.categoryId, cat.id))
  }

  if (searchParams.free === 'true') {
    conditions.push(eq(events.isFree, true))
  }

  const [eventsList, allCategories, totalCount] = await Promise.all([
    db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(desc(events.qualityScore))
      .limit(48),
    db.select().from(categories).orderBy(asc(categories.position)),
    db.select({ value: count() }).from(events).where(and(...conditions)),
  ])

  return { events: eventsList, categories: allCategories, total: Number(totalCount[0].value) }
}

const CATEGORY_ICONS: Record<string, string> = {
  concert: '🎵', expo: '🎨', theatre: '🎭', cinema: '🎬',
  festival: '🎪', conference: '🎤', danse: '💃', spectacle: '🎪',
  atelier: '🛠️', visite: '🏛️', sport: '⚽',
}

const DATE_LABELS: Record<string, string> = {
  today: "Aujourd'hui", weekend: 'Ce week-end', week: 'Cette semaine',
}

const AMBIANCE_LABELS: Record<string, { emoji: string; label: string }> = {
  romantique: { emoji: '💕', label: 'Romantique' },
  festif: { emoji: '🎉', label: 'Festif' },
  chill: { emoji: '😌', label: 'Chill' },
  familial: { emoji: '👨‍👩‍👧‍👦', label: 'Familial' },
  underground: { emoji: '🌑', label: 'Underground' },
  chic: { emoji: '✨', label: 'Chic' },
  culturel: { emoji: '📚', label: 'Culturel' },
  sportif: { emoji: '💪', label: 'Sportif' },
  pleinair: { emoji: '🌿', label: 'Plein air' },
  immersif: { emoji: '🎭', label: 'Immersif' },
}

function AIIntentBanner({ intent, query }: { intent: AIIntent; query: string }) {
  const pills: Array<{ icon: string; label: string }> = []

  if (intent.category) {
    const icon = CATEGORY_ICONS[intent.category] || '📌'
    pills.push({ icon, label: intent.category.charAt(0).toUpperCase() + intent.category.slice(1) })
  }

  if (intent.arrondissements.length > 0) {
    const arrLabel = intent.arrondissements.length === 1
      ? `${intent.arrondissements[0]} arr.`
      : intent.arrondissements.join(', ') + ' arr.'
    pills.push({ icon: '📍', label: arrLabel })
  }

  if (intent.isFree === true) pills.push({ icon: '💰', label: 'Gratuit' })

  if (intent.specificDate) {
    const date = new Date(intent.specificDate)
    pills.push({ icon: '📅', label: date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) })
  } else if (intent.dateFilter) {
    pills.push({ icon: '📅', label: DATE_LABELS[intent.dateFilter] || intent.dateFilter })
  }

  if (intent.ambiance) {
    const amb = AMBIANCE_LABELS[intent.ambiance]
    if (amb) pills.push({ icon: amb.emoji, label: amb.label })
  }

  if (intent.audience) {
    const audiences: Record<string, string> = {
      couple: '💑 En couple', famille: '👨‍👩‍👧 En famille',
      amis: '👯 Entre amis', solo: '🧍 Solo', enfants: '👶 Enfants',
    }
    pills.push({ icon: '', label: audiences[intent.audience] || intent.audience })
  }

  if (intent.keywords.length > 0) {
    pills.push({ icon: '🔑', label: intent.keywords.join(', ') })
  }

  return (
    <div className="mt-4 rounded-xl border border-accent/20 bg-gradient-to-r from-accent/5 to-transparent p-4">
      {/* Intent summary */}
      <div className="flex items-start gap-2">
        <span className="text-lg">🧠</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-text-primary">{intent.intentSummary}</p>
          {intent.isVague && (
            <p className="mt-0.5 text-xs text-text-muted">
              Requête générale — voici une sélection variée
            </p>
          )}
        </div>
      </div>

      {/* Filter pills */}
      {pills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pills.map((pill, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-text-primary border border-border shadow-sm"
            >
              {pill.icon && <span>{pill.icon}</span>}
              {pill.label}
            </span>
          ))}
        </div>
      )}

      {/* Suggested queries */}
      {intent.suggestedQueries.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-xs text-text-muted mr-1 self-center">Essaye aussi :</span>
          {intent.suggestedQueries.slice(0, 3).map((sq, i) => (
            <a
              key={i}
              href={`/evenements?q=${encodeURIComponent(sq)}&ai=1`}
              className="rounded-full border border-accent/30 bg-accent/5 px-2.5 py-1 text-xs text-accent hover:bg-accent/10 transition-colors"
            >
              {sq}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function AlternativesSuggestions({
  alternatives,
  intent,
}: {
  alternatives: SearchResult[]
  intent: AIIntent
}) {
  if (alternatives.length === 0) return null

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">💡</span>
        <h2 className="text-base font-semibold text-text-primary">
          {intent.category ? 'Autres idées de sorties' : 'Vous pourriez aussi aimer'}
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {alternatives.map((alt) => (
          <EventCard
            key={alt.event.id}
            event={{
              ...alt.event,
              category: alt.category,
              venue: alt.venue,
              tags: [],
              ambiances: [],
            } as never}
          />
        ))}
      </div>
    </div>
  )
}

function StrategyBadge({ strategy }: { strategy: string }) {
  const labels: Record<string, string> = {
    exact: 'Résultat exact',
    expanded_keywords: 'Recherche élargie',
    category_date_only: 'Par catégorie',
    no_arrondissement: 'Tous quartiers',
    no_date: 'Toutes dates',
    category_only: 'Par catégorie',
    popular_fallback: 'Suggestions populaires',
  }

  const parts = strategy.split('+')
  const label = parts.map(p => labels[p] || p).join(' + ')

  if (strategy.includes('fallback')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2.5 py-0.5 text-xs text-yellow-700 border border-yellow-200">
        ⚡ {label}
      </span>
    )
  }

  return null
}

export default async function EvenementsPage({ searchParams }: Props) {
  const params = await searchParams
  const hasQuery = params.q && params.q.trim().length >= 2
  const isAI = hasQuery && (params.ai === '1' || params.q!.trim().length >= 8)

  let eventsList: Array<{
    event: typeof events.$inferSelect
    venue: typeof venues.$inferSelect | null
    category: typeof categories.$inferSelect | null
    relevanceReason?: string
    relevanceScore?: number
  }> = []
  let cats: Awaited<ReturnType<typeof getEvents>>['categories'] = []
  let totalEvents = 0
  let aiIntent: AIIntent | null = null
  let aiError = false
  let searchStrategy = ''
  let alternatives: SearchResult[] = []

  if (isAI) {
    try {
      const result = await aiSearch(params.q!)
      aiIntent = result.intent
      eventsList = result.events
      totalEvents = result.totalFound
      searchStrategy = result.searchStrategy
      alternatives = result.alternatives

      cats = await db.select().from(categories).orderBy(asc(categories.position))
    } catch (error) {
      console.error('[AI Search Page] Error:', error)
      aiError = true
      const normalResult = await getEvents(params)
      eventsList = normalResult.events
      cats = normalResult.categories
      totalEvents = normalResult.total
    }
  } else if (hasQuery) {
    // Short query — use normal DB search with keyword column
    const normalResult = await getEvents(params)
    eventsList = normalResult.events
    cats = normalResult.categories
    totalEvents = normalResult.total
  } else {
    const normalResult = await getEvents(params)
    eventsList = normalResult.events
    cats = normalResult.categories
    totalEvents = normalResult.total
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
            {totalEvents.toLocaleString('fr-FR')} événement{totalEvents !== 1 ? 's' : ''} trouvé{totalEvents !== 1 ? 's' : ''}
            {searchStrategy.includes('fallback') && totalEvents > 0 && (
              <> — <StrategyBadge strategy={searchStrategy} /></>
            )}
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

      {/* AI Intent Banner */}
      {aiIntent && params.q && (
        <AIIntentBanner intent={aiIntent} query={params.q} />
      )}

      {/* Alternative interpretations for ambiguous queries */}
      {aiIntent?.alternativeInterpretations && aiIntent.alternativeInterpretations.length > 0 && aiIntent.isVague && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-muted">Interprétations possibles :</span>
          {aiIntent.alternativeInterpretations.slice(0, 4).map((interp, i) => (
            <a
              key={i}
              href={`/evenements?q=${encodeURIComponent(interp)}&ai=1`}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
            >
              {interp}
            </a>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mt-4">
        <Suspense fallback={<div className="h-9" />}>
          <FilterBar categories={cats} />
        </Suspense>
      </div>

      {/* Results grid */}
      {eventsList.length > 0 ? (
        <div className="mt-6">
          <InfiniteEventGrid
            initialEvents={eventsList.map((item) => ({
              ...item.event,
              category: item.category,
              venue: item.venue,
              tags: [],
              ambiances: [],
              _relevanceReason: item.relevanceReason,
            } as never))}
            apiParams={{
              ...(params.category ? { category: params.category } : {}),
              ...(params.date ? { date: params.date } : {}),
              ...(params.free === 'true' ? { free: 'true' } : {}),
            }}
            sort="quality"
          />
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
          {aiIntent?.suggestedQueries && aiIntent.suggestedQueries.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {aiIntent.suggestedQueries.map((sq, i) => (
                <a
                  key={i}
                  href={`/evenements?q=${encodeURIComponent(sq)}&ai=1`}
                  className="rounded-full border border-accent/30 bg-accent/5 px-3 py-1.5 text-sm text-accent hover:bg-accent/10 transition-colors"
                >
                  {sq}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Alternatives section */}
      {aiIntent && (
        <AlternativesSuggestions alternatives={alternatives} intent={aiIntent} />
      )}
    </div>
  )
}
