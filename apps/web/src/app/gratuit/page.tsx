import { AgendaView, mergeParams, type SearchParams } from '@/components/agenda/agenda-view'
import { listingMetadata } from '@/lib/seo'

type Props = { searchParams: Promise<SearchParams> }

export async function generateMetadata({ searchParams }: Props) {
  return listingMetadata(
    '/gratuit',
    'Sorties gratuites à Paris : concerts, expos, rencontres',
    'Les sorties gratuites à Paris, jour par jour et mois par mois. Uniquement des événements annoncés gratuits par leurs organisateurs.',
    await searchParams
  )
}

export default async function GratuitPage({ searchParams }: Props) {
  return (
    <AgendaView
      params={mergeParams(await searchParams, { free: '1' })}
      title="Gratuit"
      intro="Uniquement des sorties annoncées gratuites par leurs organisateurs. Choisis un mois ou un jour pour aller plus loin."
      emptyActions={[{ href: '/agenda', label: 'Tout l’agenda' }]}
    />
  )
}
