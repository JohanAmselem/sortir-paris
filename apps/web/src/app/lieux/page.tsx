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
    list = await getActiveVenues(300)
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
        {list.length > 0 && `${list.length} lieux ont des événements à venir. Les plus actifs en premier, quartier par quartier.`}
      </PageIntro>

      {failed ? (
        <DataUnavailable />
      ) : (
        <>
          <nav aria-label="Aller à l’arrondissement" className="rail scrollbar-hide mb-6">
            {order.map((k) => (
              <a key={k} href={`#arr-${k}`} className="inline-flex h-10 items-center rounded-full border border-border-strong bg-surface px-4 text-[14px] font-semibold">
                {k}
              </a>
            ))}
          </nav>
          <div className="space-y-10">
            {order.map((k) => (
              <section key={k} id={`arr-${k}`} aria-labelledby={`h-${k}`} className="scroll-mt-20">
                <h2 id={`h-${k}`} className="font-display text-[2rem] text-ink">
                  {k}
                </h2>
                <ul className="mt-3 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                  {byArr.get(k)!.map((v) => (
                    <li key={v.slug} className="border-b border-border">
                      <Link href={`/lieux/${v.slug}`} className="flex items-baseline justify-between gap-3 py-3 hover:text-accent">
                        <span className="min-w-0 truncate text-[16px] font-semibold">{v.name}</span>
                        <span className="shrink-0 text-[13px] text-text-secondary">
                          {v.upcoming} à venir
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
