import { Listing, PageIntro } from '@/components/events/listing'
import { parseEventParams } from '@/lib/events/params'
import { listingMetadata } from '@/lib/seo'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: Props) {
  return listingMetadata(
    '/ce-soir',
    'Que faire à Paris ce soir ? Concerts, spectacles, sorties',
    'Ce qui se passe ce soir à Paris, heure par heure : concerts, théâtre, spectacles, soirées et sorties gratuites, mis à jour en continu.',
    await searchParams
  )
}

export default async function CeSoirPage({ searchParams }: Props) {
  const query = parseEventParams(await searchParams)
  return (
    <div className="px-4">
      <PageIntro kicker="Paris, heure par heure" title="Ce soir">
        Tout ce qui commence ce soir, du premier verre au dernier set. Les films sont regroupés juste en dessous, les expositions ont leur propre rubrique.
      </PageIntro>
      <Listing
        query={query}
        fixed={{ when: 'tonight' }}
        locked={['when']}
        basePath="/ce-soir"
        layout="slots"
        filmsBlock={{ title: 'Films ce soir' }}
        emptyTitle="La soirée est calme"
        emptyText="Aucune sortie repérée pour ce soir avec ces critères."
        emptyActions={[
          { href: '/ce-week-end', label: 'Voir le week-end' },
          { href: '/evenements?when=tomorrow', label: 'Et demain ?' },
        ]}
      />
    </div>
  )
}
