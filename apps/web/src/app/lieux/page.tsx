import Link from 'next/link'
import { PageIntro } from '@/components/events/listing'
import { DataUnavailable } from '@/components/events/blocks'
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
          <nav aria-label="Aller à l’arrondissement" className="rail scrollbar-hide mb-6 overflow-x-auto">
            {order.map((k) => (
              <a
                key={k}
                href={`#arr-${slugKey(k)}`}
                className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-full border border-border-strong bg-surface px-4 text-[14px] font-semibold"
              >
                {k}
              </a>
            ))}
          </nav>
          <div className="space-y-10">
            {order.map((k) => (
              <section key={k} id={`arr-${slugKey(k)}`} aria-labelledby={`h-${slugKey(k)}`} className="scroll-mt-20">
                <h2 id={`h-${slugKey(k)}`} className="font-display text-[2rem] text-ink">
                  {k}
                  <span className="ml-2 font-sans text-[14px] font-normal text-text-muted">{byArr.get(k)!.length} lieux</span>
                </h2>
                <VenueList venues={byArr.get(k)!.slice(0, SHOWN)} />
                {byArr.get(k)!.length > SHOWN && (
                  <details className="group mt-1">
                    <summary className="inline-flex h-11 cursor-pointer list-none items-center text-[15px] font-semibold text-accent hover:underline">
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
            <span className="min-w-0 truncate text-[16px] font-semibold">{v.name}</span>
            <span className="shrink-0 text-[13px] text-text-secondary">{v.upcoming} à venir</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
