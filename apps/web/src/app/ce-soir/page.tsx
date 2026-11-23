import { AgendaView, mergeParams, type SearchParams } from '@/components/agenda/agenda-view'
import { listingMetadata } from '@/lib/seo'

type Props = { searchParams: Promise<SearchParams> }

export async function generateMetadata({ searchParams }: Props) {
  return listingMetadata(
    '/ce-soir',
    'Que faire à Paris ce soir ? Concerts, spectacles, sorties',
    'Ce qui se passe ce soir à Paris, créneau par créneau : concerts, théâtre, spectacles, soirées et sorties gratuites, mis à jour en continu.',
    await searchParams
  )
}

export default async function CeSoirPage({ searchParams }: Props) {
  return (
    <AgendaView
      params={mergeParams(await searchParams, { when: 'tonight' })}
      title="Ce soir"
      intro="Tout ce qui commence ce soir à Paris, du premier verre au dernier set, créneau par créneau."
      showCalendar={false}
      groupBy="slot"
      emptyActions={[
        { href: '/agenda?when=tomorrow', label: 'Et demain ?' },
        { href: '/ce-week-end', label: 'Ce week-end' },
      ]}
    />
  )
}
