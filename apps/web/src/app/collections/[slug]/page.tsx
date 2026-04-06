import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { EventCard } from '@/components/events/event-card'
import { getCollection, COLLECTIONS } from '../collections-data'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return COLLECTIONS.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const collection = getCollection(slug)
  if (!collection) return { title: 'Collection introuvable' }

  return {
    title: `${collection.title} — Paname Club`,
    description: collection.description.slice(0, 160),
    alternates: { canonical: `/collections/${slug}` },
  }
}

export const revalidate = 300

export default async function CollectionPage({ params }: Props) {
  const { slug } = await params
  const collection = getCollection(slug)
  if (!collection) notFound()

  const results = await collection.query()

  return (
    <div className="px-4 py-6">
      {/* Back */}
      <Link
        href="/collections"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-muted hover:text-text-primary transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Collections
      </Link>

      {/* Header */}
      <div className="mt-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{collection.emoji}</span>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{collection.title}</h1>
            <p className="text-[13px] text-text-muted">{collection.subtitle}</p>
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-text-secondary">
          {collection.description}
        </p>
        <p className="mt-2 text-[13px] text-text-muted">
          {results.length} événement{results.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Grid */}
      {results.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((r) => (
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
      ) : (
        <div className="mt-16 text-center">
          <p className="text-4xl">🔍</p>
          <p className="mt-3 text-lg font-medium text-text-primary">Aucun événement trouvé</p>
          <p className="mt-1 text-[13px] text-text-muted">
            Cette collection est vide pour le moment — revenez bientôt !
          </p>
        </div>
      )}
    </div>
  )
}
