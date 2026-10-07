import Link from 'next/link'
import { PageIntro } from '@/components/events/listing'
import { COLLECTIONS } from '@/lib/collections'

export const metadata = {
  title: 'Nos sélections de sorties à Paris',
  description: 'Expos du moment, sorties gratuites, jazz, théâtre, en famille, en amoureux, insolite : nos sélections thématiques mises à jour chaque jour.',
  alternates: { canonical: '/collections' },
}

export default function CollectionsPage() {
  return (
    <div className="px-4">
      <PageIntro kicker="Envie de…" title="Nos sélections">
        Des listes thématiques recalculées chaque jour à partir de l’agenda : seuls les événements à venir y figurent.
      </PageIntro>
      <ul className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
        {COLLECTIONS.map((c) => (
          <li key={c.slug} className="bg-surface">
            <Link href={`/collections/${c.slug}`} className="block p-5 transition-colors hover:bg-surface-hover">
              <span className="font-display block text-[2rem] text-ink">{c.title}</span>
              <span className="mt-1 block text-[15px] text-text-secondary">{c.tagline}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
