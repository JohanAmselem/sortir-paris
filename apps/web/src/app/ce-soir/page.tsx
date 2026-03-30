import { Metadata } from 'next'
import { EventCard } from '@/components/events/event-card'
import { FilterBar } from '@/components/search/filter-bar'

export const metadata: Metadata = {
  title: 'Sortir ce soir à Paris — Concerts, Expos, Théâtre',
  description:
    'Tous les événements culturels ce soir à Paris. Concerts, expositions, théâtre, cinéma. Trouvez votre sortie en 30 secondes.',
  alternates: { canonical: '/ce-soir' },
}

export const dynamic = 'force-dynamic'

async function getTonightEvents() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/events?date=today&limit=30&sort=popular`, {
    next: { revalidate: 1800 },
  })
  return res.json()
}

async function getCategories() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/categories`, { next: { revalidate: 3600 } })
  return res.json()
}

export default async function CeSoirPage() {
  const [eventsData, categories] = await Promise.all([
    getTonightEvents(),
    getCategories(),
  ])

  const events = eventsData.data ?? []

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold text-text-primary">Ce soir à Paris</h1>
      <p className="mt-1 text-sm text-text-secondary">
        {events.length} événements ce soir
      </p>

      <div className="mt-4">
        <FilterBar categories={categories} />
      </div>

      {events.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((item: { event?: Record<string, unknown>; id?: string }) => {
            const event = item.event ?? item
            return <EventCard key={(event as { id: string }).id} event={event as never} />
          })}
        </div>
      ) : (
        <div className="mt-16 text-center">
          <p className="text-4xl">🌙</p>
          <p className="mt-4 text-lg font-medium text-text-primary">
            Pas d&apos;événement ce soir
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Consultez les sorties du week-end
          </p>
        </div>
      )}
    </div>
  )
}
