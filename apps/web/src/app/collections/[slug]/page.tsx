import { notFound, permanentRedirect } from 'next/navigation'
import { Listing, PageIntro } from '@/components/events/listing'
import { COLLECTIONS, LEGACY_COLLECTION_SLUGS, getCollection } from '@/lib/collections'
import { parseEventParams } from '@/lib/events/params'
import { listingMetadata } from '@/lib/seo'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export function generateStaticParams() {
  return COLLECTIONS.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params, searchParams }: Props) {
  const { slug } = await params
  const c = getCollection(slug)
  if (!c) return {}
  return listingMetadata(`/collections/${slug}`, `${c.title} à Paris`, c.intro, await searchParams)
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { slug } = await params
  if (LEGACY_COLLECTION_SLUGS[slug]) permanentRedirect(`/collections/${LEGACY_COLLECTION_SLUGS[slug]}`)
  const c = getCollection(slug)
  if (!c) notFound()
  const query = parseEventParams(await searchParams)
  return (
    <div className="px-4">
      <PageIntro kicker="Sélection" title={c.title}>
        {c.intro}
      </PageIntro>
      <Listing
        query={query}
        fixed={c.query}
        locked={[
          ...(c.query.categories?.length ? (['categories'] as const) : []),
          ...(c.query.free ? (['free'] as const) : []),
        ]}
        basePath={`/collections/${slug}`}
        emptyActions={[{ href: '/collections', label: 'Autres sélections' }]}
      />
    </div>
  )
}
