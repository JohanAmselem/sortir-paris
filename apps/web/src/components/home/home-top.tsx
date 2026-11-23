'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { CalendarDays, Loader2, MapPin } from 'lucide-react'
import { EventCard } from '@/components/events/event-card'
import { SectionHeader } from '@/components/events/blocks'
import { SiteSearch } from '@/components/search/site-search'
import { countLabel } from '@/lib/agenda-view'
import type { HomeV2Response, HomeWhen } from '@/lib/api-v2/contract'
import type { CardEvent } from '@/lib/events/types'
import { cn } from '@/lib/utils'

const WHENS: Array<{ id: HomeWhen; label: string; title: string; suffix: string; href: string }> = [
  { id: 'tonight', label: 'Ce soir', title: 'Ce soir à Paris', suffix: 'ce soir', href: '/ce-soir' },
  { id: 'tomorrow', label: 'Demain', title: 'Demain à Paris', suffix: 'demain', href: '/agenda?when=tomorrow' },
  { id: 'weekend', label: 'Ce week-end', title: 'Ce week-end à Paris', suffix: 'ce week-end', href: '/ce-week-end' },
]

interface Slice {
  picks: CardEvent[]
  count: number
}

interface HomeTopProps {
  initial: Pick<HomeV2Response, 'when' | 'picks' | 'count'>
  /** « Lundi 23 novembre », « Du vendredi 27 au dimanche 29 novembre »… */
  dateLines: Record<HomeWhen, string>
  nowIso: string
}

/**
 * Haut de l'accueil : « Ce soir à Paris », la recherche, les pastilles de temps
 * (qui changent « Notre choix » en place, via /api/v2/home) et Notre choix.
 */
export function HomeTop({ initial, dateLines, nowIso }: HomeTopProps) {
  const [when, setWhen] = useState<HomeWhen>(initial.when)
  const [slice, setSlice] = useState<Slice>({ picks: initial.picks, count: initial.count })
  const [loading, setLoading] = useState<HomeWhen | null>(null)
  const [error, setError] = useState(false)
  const cache = useRef<Partial<Record<HomeWhen, Slice>>>({ [initial.when]: { picks: initial.picks, count: initial.count } })
  const now = new Date(nowIso)
  const current = WHENS.find((w) => w.id === when) ?? WHENS[0]

  const choose = async (id: HomeWhen) => {
    if (id === when && !error) return
    setError(false)
    const hit = cache.current[id]
    if (hit) {
      setWhen(id)
      setSlice(hit)
      return
    }
    setLoading(id)
    try {
      const res = await fetch(`/api/v2/home?when=${id}`)
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as HomeV2Response
      const next = { picks: body.picks, count: body.count }
      cache.current[id] = next
      setWhen(id)
      setSlice(next)
    } catch {
      setError(true)
    } finally {
      setLoading(null)
    }
  }

  const pill = 't-small inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 font-semibold transition-colors'

  return (
    <>
      <section aria-labelledby="accueil-titre" className="px-4 pt-6 md:pt-12">
        <h1 id="accueil-titre" className="t-display text-ink" aria-live="polite">
          {current.title}
        </h1>
        <p className="t-body mt-2 text-text-secondary">
          {dateLines[when]}
          {slice.count > 0 && ` · ${countLabel(slice.count)} ${current.suffix}`}
        </p>
        <SiteSearch size="lg" className="mt-5 max-w-2xl" id="recherche-accueil" />
        <div role="group" aria-label="Quand ?" className="scrollbar-hide -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {WHENS.map((w) => (
            <button
              key={w.id}
              type="button"
              aria-pressed={when === w.id}
              onClick={() => choose(w.id)}
              className={cn(pill, when === w.id ? 'border-ink bg-ink text-paper' : 'border-border-strong text-ink hover:border-ink')}
            >
              {loading === w.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {w.label}
            </button>
          ))}
          <Link href="/agenda" className={cn(pill, 'border-border-strong text-ink hover:border-ink')}>
            <CalendarDays className="h-4 w-4" aria-hidden />
            Plus tard
          </Link>
          <Link href="/carte" className={cn(pill, 'border-border-strong text-ink hover:border-ink')}>
            <MapPin className="h-4 w-4" aria-hidden />
            Près de moi
          </Link>
        </div>
        {error && (
          <p className="t-small mt-2 text-error" role="alert">
            Le chargement a échoué : touche la pastille pour réessayer.
          </p>
        )}
      </section>

      <section aria-labelledby="choix-titre" className="px-4 pt-10">
        <SectionHeader id="choix-titre" title="Notre choix" href={current.href} linkLabel={`Tout ${current.suffix}`} />
        {slice.picks.length === 0 ? (
          <p className="t-body mt-4 text-text-secondary">
            Plus grand-chose {current.suffix}.{' '}
            <Link href="/agenda" className="font-semibold text-accent underline underline-offset-2">
              Regarde l’agenda
            </Link>
            .
          </p>
        ) : (
          <ul className={cn('rail scrollbar-hide mt-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0', loading && 'opacity-60')}>
            {slice.picks.map((e, i) => (
              <li key={e.id} className={cn('w-[78vw] max-w-[340px] md:w-auto md:max-w-none', i >= 3 && 'md:hidden')}>
                <EventCard event={e} variant="poster" now={now} priority={i === 0} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
