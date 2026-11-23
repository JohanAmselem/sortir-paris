import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { AgendaView, loadAgenda } from '@/components/agenda/agenda-view'
import { countLabel } from '@/lib/agenda-view'
import { isPastMonth, monthWithYear, validMonth } from '@/lib/agenda-pages'
import { CATEGORY_BY_SLUG } from '@/lib/events/taxonomy'
import { DEFAULT_OG_IMAGE } from '@/lib/seo'

export const revalidate = 900

type Props = { params: Promise<{ mois: string; categorie: string }> }

export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mois, categorie } = await params
  const cat = CATEGORY_BY_SLUG[categorie]
  if (!validMonth(mois) || !cat) return { title: 'Page introuvable', robots: { index: false } }
  const label = monthWithYear(mois)
  const agenda = await loadAgenda(new URLSearchParams({ when: mois, cat: categorie }).toString())
  const n = agenda.total ?? agenda.events.length
  const title = `${cat.plural} à Paris en ${label} : l’agenda`
  const description = `${countLabel(n, [categorie])} à Paris en ${label}, jour par jour : dates, salles, prix et billetteries.`
  const path = `/agenda/${mois}/${categorie}`
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: n === 0 ? { index: false, follow: true } : undefined,
    openGraph: { title, description, url: path, type: 'website', images: [DEFAULT_OG_IMAGE] },
  }
}

export default async function AgendaMonthCategoryPage({ params }: Props) {
  const { mois, categorie } = await params
  const cat = CATEGORY_BY_SLUG[categorie]
  // Mois passé déjà indexé : vers l'agenda de la catégorie (301), pas une 404.
  if (isPastMonth(mois) && cat) permanentRedirect(`/agenda?cat=${categorie}`)
  if (!validMonth(mois) || !cat) notFound()
  return <AgendaView params={new URLSearchParams({ when: mois, cat: categorie })} title={`${cat.plural} à Paris en ${monthWithYear(mois)}`} />
}
