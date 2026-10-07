import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { Listing, PageIntro } from '@/components/events/listing'
import { SearchBox } from '@/components/search/search-box'
import { parseEventParams, eventsHref } from '@/lib/events/params'
import { parseOutingRequest } from '@/lib/ai/intent'
import { intentToQuery } from '@/lib/ai/recommend'
import { listingMetadata } from '@/lib/seo'
import type { EventQuery } from '@/lib/events/types'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: Props) {
  const params = await searchParams
  const meta = listingMetadata(
    '/evenements',
    'Toutes les sorties à Paris : agenda culturel',
    'L’agenda des sorties culturelles à Paris : concerts, expositions, théâtre, cinéma, ateliers. Filtre par date, quartier, budget et ambiance.',
    params
  )
  if (typeof params.q === 'string' && params.q) meta.title = `« ${params.q.slice(0, 60)} » : sorties à Paris`
  return meta
}

/** A query that reads like a sentence ("un truc à deux ce soir dans le 11e") is turned into filters. */
function looksLikeSentence(q: string): boolean {
  return q.trim().split(/\s+/).length >= 3
}

export default async function EvenementsPage({ searchParams }: Props) {
  const params = await searchParams
  let query = parseEventParams(params)
  let understood: { summary: string; source: 'rules' | 'ai' | 'empty'; editHref: string } | null = null

  if (query.q && looksLikeSentence(query.q) && params.raw !== '1') {
    const { intent, source } = await parseOutingRequest(query.q)
    if (source !== 'empty') {
      const fromIntent = intentToQuery(intent, query.near)
      const merged: EventQuery = {
        ...query,
        ...fromIntent,
        when: query.when ?? intent.date ?? intent.when ?? null,
        categories: query.categories?.length ? query.categories : fromIntent.categories,
        arrondissements: query.arrondissements?.length ? query.arrondissements : fromIntent.arrondissements,
        near: query.near ?? fromIntent.near ?? null,
      }
      understood = {
        summary: intent.summary,
        source,
        editHref: eventsHref({ ...merged }),
      }
      query = merged
    }
  }

  return (
    <div className="px-4">
      <PageIntro title={query.q || understood ? 'Résultats' : 'Explorer'}>
        {!query.q && !understood && 'Toutes les sorties à venir à Paris. Commence par une envie, un quartier ou une date.'}
      </PageIntro>

      <SearchBox initial={typeof params.q === 'string' ? params.q : ''} className="mb-4 max-w-2xl" />

      {understood && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-accent-soft px-4 py-3 text-[15px]">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden />
          <span>
            On a compris : <strong className="font-semibold">{understood.summary}</strong>
          </span>
          <Link href={`/evenements?q=${encodeURIComponent(String(params.q))}&raw=1`} className="text-[14px] text-accent underline underline-offset-2">
            Chercher le texte exact
          </Link>
        </div>
      )}

      <Listing
        query={query}
        basePath="/evenements"
        emptyTitle="Aucune sortie trouvée"
        emptyText={query.q ? 'Essaie un mot plus simple, ou retire un filtre.' : 'Essaie d’enlever un filtre ou d’élargir la période.'}
        emptyActions={[
          { href: '/ce-soir', label: 'Ce soir' },
          { href: '/ce-week-end', label: 'Ce week-end' },
        ]}
      />
    </div>
  )
}
