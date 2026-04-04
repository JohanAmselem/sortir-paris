import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EventCard } from '@/components/events/event-card'
import { db, events, venues, categories } from '@sortir/db'
import { eq, and, gte, desc } from 'drizzle-orm'

interface Props {
  params: Promise<{ slug: string }>
}

async function getCategoryData(slug: string) {
  const category = await db.query.categories?.findFirst({
    where: eq(categories.slug, slug),
  })

  if (!category) return null

  const now = new Date()
  const categoryEvents = await db
    .select({ event: events, venue: venues, category: categories })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(
      and(
        eq(events.status, 'active'),
        eq(events.categoryId, category.id),
        gte(events.startDate, now)
      )
    )
    .orderBy(desc(events.qualityScore))
    .limit(48)

  return { category, events: categoryEvents }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await getCategoryData(slug)
  if (!data) return { title: 'Catégorie introuvable' }

  return {
    title: `${data.category.name} à Paris`,
    description: `Découvrez les ${data.category.name.toLowerCase()} à Paris. ${data.events.length} événements disponibles.`,
    alternates: { canonical: `/categories/${slug}` },
  }
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params
  const data = await getCategoryData(slug)

  if (!data) notFound()

  const { category, events: categoryEvents } = data

  return (
    <div className="px-4 py-6">
      <div className="flex items-center gap-3">
        <span className="text-4xl">{category.icon}</span>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{category.name}</h1>
          <p className="text-sm text-text-muted">
            {categoryEvents.length} événements à venir
          </p>
        </div>
      </div>

      {categoryEvents.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {categoryEvents.map((item) => (
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
        <div className="mt-16 text-center">
          <p className="text-5xl">{category.icon}</p>
          <p className="mt-4 text-lg font-semibold text-text-primary">
            Pas d&apos;événement à venir
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Revenez bientôt !
          </p>
        </div>
      )}
    </div>
  )
}
