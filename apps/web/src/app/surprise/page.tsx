import { Metadata } from 'next'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, desc, sql } from 'drizzle-orm'
import { SurpriseCard } from './surprise-card'

export const metadata: Metadata = {
  title: 'Surprise moi — Paname Club',
  description: 'Laisse le hasard décider. Découvre un événement culturel à Paris choisi pour toi.',
  alternates: { canonical: '/surprise' },
}

export const dynamic = 'force-dynamic'

async function getRandomEvent() {
  const now = new Date()

  const results = await db
    .select({ event: events, venue: venues, category: categories })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(
      and(
        eq(events.status, 'active'),
        gte(events.startDate, now)
      )
    )
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

export default async function SurprisePage() {
  const event = await getRandomEvent()

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-8">
      <div className="text-center">
        <h1 className="text-4xl font-black text-text-primary">
          🎲 Surprise !
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          On a choisi un événement au hasard pour toi
        </p>
      </div>

      {event ? (
        <SurpriseCard event={event as never} />
      ) : (
        <div className="mt-12 text-center">
          <p className="text-5xl">😢</p>
          <p className="mt-4 text-lg font-medium text-text-primary">
            Aucun événement disponible
          </p>
        </div>
      )}
    </div>
  )
}
