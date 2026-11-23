import type { Metadata } from 'next'
import { permanentRedirect } from 'next/navigation'
import { AgendaView, loadAgenda, mergeParams, type SearchParams } from '@/components/agenda/agenda-view'
import { agendaHref, isMonthKey } from '@/lib/agenda-view'
import { listingMetadata } from '@/lib/seo'

type Props = { searchParams: Promise<SearchParams> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''
  const meta = listingMetadata(
    '/agenda',
    'Agenda des sorties à Paris, jour par jour',
    'Tout ce qui se passe à Paris, des prochains jours à 2028 : concerts, expos, théâtre, spectacles, mois par mois et jour par jour.',
    sp
  )
  if (q) {
    const agenda = await loadAgenda(mergeParams(sp).toString())
    meta.title = `« ${q.slice(0, 60)} » : ${agenda.total ?? agenda.events.length} sorties à Paris`
    meta.robots = { index: false, follow: true }
  }
  return meta
}

export default async function AgendaPage({ searchParams }: Props) {
  const sp = await searchParams
  const params = mergeParams(sp)
  // « ?when=2027-03 » seul : la page mois indexable.
  const keys = [...params.keys()]
  if (isMonthKey(params.get('when')) && keys.every((k) => k === 'when' || k === 'cat')) {
    const pretty = agendaHref(params)
    if (!pretty.startsWith('/agenda?')) permanentRedirect(pretty)
  }
  return <AgendaView params={params} title="Agenda" />
}
