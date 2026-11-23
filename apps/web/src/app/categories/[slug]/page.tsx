import { notFound } from 'next/navigation'
import { AgendaView, mergeParams, type SearchParams } from '@/components/agenda/agenda-view'
import { CATEGORIES, CATEGORY_BY_SLUG } from '@/lib/events/taxonomy'
import { listingMetadata } from '@/lib/seo'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<SearchParams>
}

const INTROS: Record<string, string> = {
  concerts: 'Les concerts à Paris, jour par jour : jazz, rock, classique, électro, chanson, des clubs aux grandes salles, jusqu’à plusieurs mois à l’avance.',
  expos: 'Les expositions en cours et à venir à Paris, des grands musées aux galeries. Les dates de fin sont toujours indiquées.',
  theatre: 'Les pièces de théâtre à l’affiche à Paris : classiques, créations, théâtre contemporain et seul-en-scène.',
  spectacles: 'Humour, cirque, magie, cabaret, comédie musicale : les spectacles à voir à Paris.',
  danse: 'Les spectacles de danse à Paris : ballet, danse contemporaine, hip-hop, bals et scènes ouvertes.',
  cinema: 'Projections, avant-premières, ciné-clubs et festivals de cinéma à Paris.',
  festivals: 'Les festivals à Paris dans les mois à venir : musique, arts, cinéma, littérature.',
  conferences: 'Conférences, rencontres, débats et lectures à Paris, souvent gratuits.',
  ateliers: 'Ateliers créatifs, initiations et cours ponctuels à Paris, pour adultes et enfants.',
  visites: 'Visites guidées, balades urbaines et découvertes du patrimoine parisien.',
  soirees: 'Soirées, clubs, DJ sets, karaokés et afterworks à Paris, ce soir et ce week-end.',
  sport: 'Sport, yoga, randonnées et activités bien-être à Paris et autour.',
}

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params, searchParams }: Props) {
  const { slug } = await params
  const cat = CATEGORY_BY_SLUG[slug]
  if (!cat) return {}
  return listingMetadata(`/categories/${slug}`, `${cat.plural} à Paris : l’agenda`, INTROS[slug] ?? '', await searchParams)
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params
  const cat = CATEGORY_BY_SLUG[slug]
  if (!cat) notFound()
  return (
    <AgendaView
      params={mergeParams(await searchParams, { cat: slug })}
      title={cat.plural}
      intro={INTROS[slug]}
      emptyActions={[{ href: '/agenda', label: 'Tout l’agenda' }]}
    />
  )
}
