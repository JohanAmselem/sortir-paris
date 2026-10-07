import { notFound, permanentRedirect } from 'next/navigation'
import Link from 'next/link'
import { Listing, PageIntro } from '@/components/events/listing'
import { parseEventParams } from '@/lib/events/params'
import { ARRONDISSEMENTS, normalizeArrondissement } from '@/lib/events/taxonomy'
import { listingMetadata } from '@/lib/seo'

type Props = {
  params: Promise<{ zone: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** Neighbourhood flavour, so each page is genuinely different. */
const QUARTIERS: Record<string, string> = {
  '1er': 'Louvre, Palais-Royal, Châtelet, Les Halles',
  '2e': 'Bourse, Sentier, Montorgueil, passages couverts',
  '3e': 'Haut-Marais, Arts et Métiers, galeries',
  '4e': 'Marais, Beaubourg, Île Saint-Louis, Hôtel de Ville',
  '5e': 'Quartier latin, Panthéon, Mouffetard',
  '6e': 'Saint-Germain-des-Prés, Odéon, Luxembourg',
  '7e': 'Orsay, quai Branly, Invalides',
  '8e': 'Champs-Élysées, Grand Palais, Madeleine',
  '9e': 'Pigalle, Opéra, Grands Boulevards',
  '10e': 'Canal Saint-Martin, gares du Nord et de l’Est',
  '11e': 'Oberkampf, Bastille, République',
  '12e': 'Bercy, Nation, Gare de Lyon',
  '13e': 'Butte-aux-Cailles, Bibliothèque François-Mitterrand',
  '14e': 'Montparnasse, Denfert, Cité universitaire',
  '15e': 'Beaugrenelle, Vaugirard, Convention',
  '16e': 'Trocadéro, Passy, Auteuil',
  '17e': 'Batignolles, Ternes, Clichy',
  '18e': 'Montmartre, Goutte d’Or, La Chapelle',
  '19e': 'La Villette, Buttes-Chaumont, Belleville',
  '20e': 'Ménilmontant, Belleville, Père-Lachaise',
}

export function generateStaticParams() {
  return ARRONDISSEMENTS.map((zone) => ({ zone }))
}

export async function generateMetadata({ params, searchParams }: Props) {
  const { zone } = await params
  const arr = normalizeArrondissement(decodeURIComponent(zone))
  if (!arr) return {}
  return listingMetadata(
    `/paris/${arr}`,
    `Que faire dans le ${arr} arrondissement de Paris ?`,
    `Sorties culturelles dans le ${arr} (${QUARTIERS[arr]}) : concerts, expos, théâtre et sorties gratuites, ce soir et cette semaine.`,
    await searchParams
  )
}

export default async function ZonePage({ params, searchParams }: Props) {
  const { zone } = await params
  const arr = normalizeArrondissement(decodeURIComponent(zone))
  if (!arr) notFound()
  if (arr !== decodeURIComponent(zone)) permanentRedirect(`/paris/${arr}`)
  const query = parseEventParams(await searchParams)
  const n = ARRONDISSEMENTS.indexOf(arr)
  const neighbours = [ARRONDISSEMENTS[n - 1], ARRONDISSEMENTS[n + 1]].filter(Boolean)

  return (
    <div className="px-4">
      <PageIntro kicker={QUARTIERS[arr]} title={`Sortir dans le ${arr}`}>
        Concerts, expos, théâtre et bons plans dans le {arr} arrondissement, classés par intérêt.
      </PageIntro>
      <Listing
        query={query}
        fixed={{ arrondissements: [arr] }}
        locked={['arrondissements']}
        basePath={`/paris/${arr}`}
        emptyTitle={`Calme plat dans le ${arr}`}
        emptyText="Aucune sortie repérée ici avec ces critères. Les arrondissements voisins ont peut-être ce qu’il te faut."
        emptyActions={neighbours.map((a) => ({ href: `/paris/${a}`, label: `Le ${a}` }))}
      />
      <nav aria-label="Autres arrondissements" className="mt-12">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-text-secondary">Autres arrondissements</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {ARRONDISSEMENTS.filter((a) => a !== arr).map((a) => (
            <li key={a}>
              <Link href={`/paris/${a}`} className="inline-flex h-10 min-w-11 items-center justify-center rounded-lg border border-border bg-surface px-3 text-[14px] font-semibold hover:border-ink">
                {a}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
