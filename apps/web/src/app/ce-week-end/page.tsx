import { AgendaView, mergeParams, type SearchParams } from '@/components/agenda/agenda-view'
import { listingMetadata } from '@/lib/seo'

type Props = { searchParams: Promise<SearchParams> }

export async function generateMetadata({ searchParams }: Props) {
  return listingMetadata(
    '/ce-week-end',
    'Que faire à Paris ce week-end ? Les sorties jour par jour',
    'Le programme du week-end à Paris, du vendredi soir au dimanche : concerts, expos, théâtre, balades et sorties gratuites.',
    await searchParams
  )
}

export default async function WeekendPage({ searchParams }: Props) {
  return (
    <AgendaView
      params={mergeParams(await searchParams, { when: 'weekend' })}
      title="Ce week-end"
      intro="Du vendredi soir au dimanche, jour par jour. Les expos à l’affiche sont regroupées à part."
      showCalendar={false}
      emptyActions={[{ href: '/agenda', label: 'Tout l’agenda' }]}
    />
  )
}
