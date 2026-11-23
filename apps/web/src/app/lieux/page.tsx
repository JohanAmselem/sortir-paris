import Link from 'next/link'
import { DataUnavailable, PageIntro } from '@/components/events/blocks'
import { getActiveVenues, type VenueSummary } from '@/lib/venues'
import { ARRONDISSEMENTS } from '@/lib/events/taxonomy'

export const revalidate = 3600

export const metadata = {
  title: 'Lieux culturels à Paris : salles, musées, clubs',
  description: 'Les salles de concert, théâtres, musées, galeries et clubs parisiens qui ont des événements à venir, classés par arrondissement.',
  alternates: { canonical: '/lieux' },
}

export default async function LieuxPage() {
  let list: VenueSummary[] = []
  let failed = false
  try {
    // Same cache entry as the sitemap: every venue with something coming up.
    list = await getActiveVenues(2000)
  } catch {
    failed = true
  }

  const byArr = new Map<string, VenueSummary[]>()
  for (const v of list) {
    const key = v.arrondissement && ARRONDISSEMENTS.includes(v.arrondissement) ? v.arrondissement : 'Hors Paris & autres'
    byArr.set(key, [...(byArr.get(key) ?? []), v])
  }
  const order = [...ARRONDISSEMENTS, 'Hors Paris & autres'].filter((k) => byArr.has(k))

  return (
    <div className="px-4">
      <PageIntro kicker="Où sortir" title="Les lieux">
        {list.length > 0 && `${list.length.toLocaleString('fr-FR')} lieux ont des événements à venir. Les plus actifs en premier, quartier par quartier.`}
      </PageIntro>

      {failed ? (
        <DataUnavailable />
      ) : (
        <>
          <nav aria-label="Aller à l’arrondissement" className="rail scrollbar-hide mb-6 overflow-x-auto pb-1">
            {order.map((k) => (
              <a
                key={k}
                href={`#arr-${slugKey(k)}`}
                className="t-small inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-border-strong px-4 font-semibold text-ink hover:border-ink"
              >
                {k}
              </a>
            ))}
          </nav>
          <div className="space-y-10">
            {order.map((k) => (
              <section key={k} id={`arr-${slugKey(k)}`} aria-labelledby={`h-${slugKey(k)}`} className="scroll-mt-20">
                <h2 id={`h-${slugKey(k)}`} className="t-title2 text-ink">
                  {k}
                  <span className="t-small ml-2 font-normal text-text-muted">{byArr.get(k)!.length} lieux</span>
                </h2>
                <VenueList venues={byArr.get(k)!.slice(0, SHOWN)} />
                {byArr.get(k)!.length > SHOWN && (
                  <details className="group mt-1">
                    <summary className="t-body inline-flex h-11 cursor-pointer list-none items-center font-semibold text-accent hover:underline">
                      <span className="group-open:hidden">Voir les {byArr.get(k)!.length - SHOWN} autres lieux</span>
                      <span className="hidden group-open:inline">Masquer</span>
                    </summary>
                    <VenueList venues={byArr.get(k)!.slice(SHOWN)} />
                  </details>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Venues shown per arrondissement before "Voir les autres". */
const SHOWN = 24

/** "Hors Paris & autres" → "hors-paris-autres" (valid fragment). */
function slugKey(k: string): string {
  return k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function VenueList({ venues }: { venues: VenueSummary[] }) {
  return (
    <ul className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
      {venues.map((v) => (
        <li key={v.slug} className="min-w-0 border-b border-border">
          <Link href={`/lieux/${v.slug}`} className="flex min-h-11 items-baseline justify-between gap-3 py-3 hover:text-accent">
            <span className="t-body min-w-0 truncate font-semibold text-ink">{v.name}</span>
            <span className="t-small shrink-0 text-text-muted">{v.upcoming} à venir</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
