import { Listing, PageIntro } from '@/components/events/listing'
import { parseEventParams } from '@/lib/events/params'
import { listingMetadata } from '@/lib/seo'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: Props) {
  return listingMetadata(
    '/gratuit',
    'Sorties gratuites à Paris : concerts, expos, rencontres',
    'Les sorties culturelles gratuites à Paris cette semaine. Uniquement des événements annoncés gratuits par leurs organisateurs.',
    await searchParams
  )
}

export default async function GratuitPage({ searchParams }: Props) {
  const query = parseEventParams(await searchParams)
  return (
    <div className="px-4">
      <PageIntro kicker="0 €" title="Gratuit">
        Uniquement des sorties annoncées gratuites par leurs organisateurs. Quand le prix est inconnu, on ne l’affiche pas ici.
      </PageIntro>
      <Listing
        query={query}
        fixed={{ free: true, when: query.when ?? 'week' }}
        locked={['free']}
        basePath="/gratuit"
        emptyActions={[{ href: '/gratuit?when=month', label: 'Sur tout le mois' }]}
      />
    </div>
  )
}
