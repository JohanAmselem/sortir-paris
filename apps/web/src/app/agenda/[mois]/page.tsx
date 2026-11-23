import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { AgendaView, loadAgenda } from '@/components/agenda/agenda-view'
import { countLabel } from '@/lib/agenda-view'
import { isPastMonth, monthWithYear, validMonth } from '@/lib/agenda-pages'
import { DEFAULT_OG_IMAGE } from '@/lib/seo'

export const revalidate = 900

type Props = { params: Promise<{ mois: string }> }

/** Aucune page au build : chacune est rendue à la première visite, puis mise en cache. */
export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mois } = await params
  if (!validMonth(mois)) return { title: 'Mois introuvable', robots: { index: false } }
  const label = monthWithYear(mois)
  const agenda = await loadAgenda(new URLSearchParams({ when: mois }).toString())
  const n = agenda.total ?? agenda.events.length
  const title = `Que faire à Paris en ${label} ? L’agenda jour par jour`
  const description = `${countLabel(n)} à Paris en ${label} : concerts, théâtre, expos, spectacles et soirées, jour par jour, avec les dates, les salles et les prix.`
  return {
    title,
    description,
    alternates: { canonical: `/agenda/${mois}` },
    robots: n === 0 ? { index: false, follow: true } : undefined,
    openGraph: { title, description, url: `/agenda/${mois}`, type: 'website', images: [DEFAULT_OG_IMAGE] },
  }
}

export default async function AgendaMonthPage({ params }: Props) {
  const { mois } = await params
  // Mois passé déjà indexé : vers l'agenda (301), pas une 404.
  if (isPastMonth(mois)) permanentRedirect('/agenda')
  if (!validMonth(mois)) notFound()
  const label = monthWithYear(mois)
  return <AgendaView params={new URLSearchParams({ when: mois })} title={`Sortir à Paris en ${label}`} />
}
