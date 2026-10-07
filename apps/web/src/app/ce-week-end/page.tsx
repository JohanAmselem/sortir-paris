import { Listing, PageIntro } from '@/components/events/listing'
import { parseEventParams } from '@/lib/events/params'
import { listingMetadata } from '@/lib/seo'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: Props) {
  return listingMetadata(
    '/ce-week-end',
    'Que faire à Paris ce week-end ? Les meilleures sorties',
    'Le programme du week-end à Paris, du vendredi soir au dimanche : concerts, expos, théâtre, balades et sorties gratuites.',
    await searchParams
  )
}

export default async function WeekendPage({ searchParams }: Props) {
  const query = parseEventParams(await searchParams)
  return (
    <div className="px-4">
      <PageIntro kicker="Du vendredi soir au dimanche" title="Ce week-end">
        Les sorties du week-end à Paris, classées par intérêt. Filtre par envie, par quartier ou par budget.
      </PageIntro>
      <Listing
        query={query}
        fixed={{ when: 'weekend' }}
        locked={['when']}
        basePath="/ce-week-end"
        emptyActions={[{ href: '/evenements?when=week', label: 'Toute la semaine' }]}
      />
    </div>
  )
}
