import { Metadata } from 'next'
import { NewsletterForm } from './newsletter-form'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, desc } from 'drizzle-orm'
import { EventCard } from '@/components/events/event-card'

export const metadata: Metadata = {
  title: 'Newsletter — Paname Club',
  description: 'Recevez chaque semaine les meilleures sorties culturelles à Paris directement dans votre boîte mail.',
  alternates: { canonical: '/newsletter' },
}

export const revalidate = 3600

async function getTopEvents() {
  const now = new Date()
  const nextWeek = new Date(now)
  nextWeek.setDate(now.getDate() + 7)

  return db
    .select({ event: events, venue: venues, category: categories })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(and(eq(events.status, 'active'), gte(events.startDate, now)))
    .orderBy(desc(events.qualityScore))
    .limit(6)
}

export default async function NewsletterPage() {
  const topEvents = await getTopEvents()

  return (
    <div className="px-4 py-8">
      {/* Hero */}
      <div className="mx-auto max-w-lg text-center">
        <span className="text-5xl">💌</span>
        <h1 className="mt-4 text-2xl font-bold text-text-primary">
          Les meilleurs plans, chaque semaine
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-text-secondary">
          Recevez notre sélection des événements incontournables à Paris.
          Concerts, expos, spectacles — le meilleur de la culture parisienne, sans spam.
        </p>

        <NewsletterForm />

        <p className="mt-3 text-[11px] text-text-muted">
          1 email par semaine · Désinscription en 1 clic
        </p>
      </div>

      {/* Preview */}
      {topEvents.length > 0 && (
        <div className="mt-12">
          <h2 className="text-center text-lg font-bold text-text-primary">
            Aperçu de la prochaine newsletter
          </h2>
          <p className="mt-1 text-center text-[13px] text-text-muted">
            Voici ce qu&apos;on vous aurait envoyé cette semaine
          </p>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topEvents.map((r) => (
              <EventCard
                key={r.event.id}
                event={{
                  ...r.event,
                  category: r.category,
                  venue: r.venue,
                  tags: [],
                  ambiances: [],
                } as never}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
