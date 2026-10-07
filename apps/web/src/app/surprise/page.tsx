import Link from 'next/link'
import { Dices } from 'lucide-react'
import { EventCard } from '@/components/events/event-card'
import { DataUnavailable, EmptyState } from '@/components/events/blocks'
import { bucketNow, safeQueryEvents } from '@/lib/events/query'
import { cn } from '@/lib/utils'

export const metadata = {
  title: 'Surprends-moi : une idée de sortie au hasard à Paris',
  description: 'Une seule idée de sortie, tirée au sort parmi les meilleurs événements à Paris. Pas convaincu ? Relance.',
  alternates: { canonical: '/surprise' },
}

type Props = { searchParams: Promise<Record<string, string | undefined>> }

const MODES = [
  { id: 'tonight', label: 'Ce soir' },
  { id: 'weekend', label: 'Ce week-end' },
  { id: 'week', label: 'Cette semaine' },
] as const

export default async function SurprisePage({ searchParams }: Props) {
  const sp = await searchParams
  const when = MODES.some((m) => m.id === sp.when) ? sp.when! : 'week'
  const free = sp.free === '1'
  const n = Math.max(0, Math.min(Number(sp.n) || 0, 500))
  const now = bucketNow()

  // Only good candidates: picture, known time, decent quality. Deterministic per hour + n.
  const pool = await safeQueryEvents({ when, free, withImage: true, oneOffOnly: when === 'tonight', sort: 'random', limit: 1, offset: n })
  const total = pool.total
  const pick = pool.events[0] ?? null
  const next = (overrides: Record<string, string | number | null>) => {
    const s = new URLSearchParams()
    const merged = { when, free: free ? '1' : null, n: n + 1, ...overrides }
    for (const [k, v] of Object.entries(merged)) if (v != null && v !== '' && v !== 0) s.set(k, String(v))
    return `/surprise?${s}`
  }

  return (
    <div className="mx-auto max-w-xl px-4 pt-6">
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-neon">Le hasard fait bien les choses</p>
      <h1 className="font-display mt-1 text-[3rem] text-ink">Surprends-moi</h1>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Quand ?">
        {MODES.map((m) => (
          <Link
            key={m.id}
            href={next({ when: m.id, n: null })}
            aria-current={when === m.id ? 'true' : undefined}
            className={cn(
              'inline-flex h-10 items-center rounded-full border px-4 text-[14px] font-medium',
              when === m.id ? 'border-ink bg-ink text-paper' : 'border-border-strong bg-surface text-ink'
            )}
          >
            {m.label}
          </Link>
        ))}
        <Link
          href={next({ free: free ? null : '1', n: null })}
          aria-current={free ? 'true' : undefined}
          className={cn('inline-flex h-10 items-center rounded-full border px-4 text-[14px] font-medium', free ? 'border-ink bg-ink text-paper' : 'border-border-strong bg-surface text-ink')}
        >
          Gratuit
        </Link>
      </div>

      <div className="mt-6 animate-scale-in" key={pick?.id ?? 'none'}>
        {pool.error ? (
          <DataUnavailable />
        ) : !pick ? (
          <EmptyState title="Plus rien dans le chapeau" actions={[{ href: '/surprise', label: 'Recommencer' }]}>
            On a fait le tour des idées pour ces critères.
          </EmptyState>
        ) : (
          <EventCard event={pick} variant="feature" priority now={now} />
        )}
      </div>

      {pick && (
        <Link
          href={total > n + 1 ? next({}) : next({ n: null })}
          className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-[16px] font-semibold text-paper transition-colors hover:bg-ink-soft"
          data-analytics="surprise"
        >
          <Dices className="h-5 w-5" aria-hidden />
          Une autre idée
        </Link>
      )}
      {total > 0 && <p className="mt-2 text-center text-[13px] text-text-muted">Tirée parmi {total.toLocaleString('fr-FR')} sorties</p>}
    </div>
  )
}
