import Link from 'next/link'
import { ArrowRight, CheckCircle2, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CountedEvent, WeeklyChallenge } from '../_lib/community'

/** Numbered list of events with a real count ("128 vues", "3 membres l'ont gardé"). */
export function RankList({
  title,
  items,
  unit,
  className,
}: {
  title: string
  items: CountedEvent[]
  unit: (n: number) => string
  className?: string
}) {
  return (
    <div className={className}>
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-text-muted">{title}</h3>
      <ol className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
        {items.map((t, i) => (
          <li key={t.event.id}>
            <Link href={`/evenements/${t.event.slug}`} className="flex items-center gap-4 p-4 transition-colors hover:bg-surface-hover">
              <span className="font-display w-7 text-[2rem] text-accent">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-ink">{t.event.title}</span>
                <span className="block truncate text-[13px] text-text-secondary">
                  {unit(t.count)}
                  {t.event.venue && ` · ${t.event.venue.name}`}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** « Défi de la semaine »: same challenge for everyone, progress from the member's real saves / « j'y vais ». */
export function ChallengeCard({ data, loggedIn }: { data: WeeklyChallenge; loggedIn: boolean }) {
  const { challenge, progress, ideas } = data
  const pct = progress ? Math.round((progress.value / progress.goal) * 100) : 0
  return (
    <div className={cn('rounded-2xl border p-5 sm:p-6', progress?.done ? 'border-accent bg-accent-soft' : 'border-border bg-surface')}>
      <div className="flex items-start gap-3">
        {progress?.done ? (
          <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-accent" aria-hidden />
        ) : (
          <Target className="mt-1 h-6 w-6 shrink-0 text-neon" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display text-[1.8rem] leading-tight text-ink">{challenge.title}</p>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-text-secondary">{challenge.text}</p>

          {progress ? (
            <div className="mt-4 max-w-sm">
              <div className="flex items-center justify-between text-[13px] font-semibold tabular-nums text-text-secondary">
                <span>{progress.done ? 'Défi relevé, bravo.' : 'Ta progression cette semaine'}</span>
                <span>
                  {progress.value}/{progress.goal}
                </span>
              </div>
              <div
                className="mt-1 h-2 overflow-hidden rounded-full bg-border"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.goal}
                aria-valuenow={progress.value}
                aria-label="Progression du défi"
              >
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : !loggedIn ? (
            <p className="mt-4 text-[14px] text-text-secondary">
              <Link href="/login?next=/club" className="font-semibold text-accent underline underline-offset-2">
                Connecte-toi
              </Link>{' '}
              pour suivre ta progression : on la calcule avec les sorties que tu gardes et celles où tu vas.
            </p>
          ) : null}

          {ideas.length > 0 && !progress?.done && (
            <p className="mt-4 text-[14px] text-text-secondary">
              Des idées :{' '}
              {ideas.map((v, i) => (
                <span key={v.slug}>
                  {i > 0 && ', '}
                  <Link href={`/lieux/${v.slug}`} className="font-semibold text-ink underline underline-offset-2 hover:text-accent">
                    {v.name}
                  </Link>
                  {v.arrondissement && ` (${v.arrondissement})`}
                </span>
              ))}
              .
            </p>
          )}

          {!progress?.done && (
            <Link
              href={challenge.href}
              className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-full bg-ink px-4 text-[14px] font-semibold text-paper transition-colors hover:bg-accent"
            >
              {challenge.cta}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
          <p className="mt-3 text-[12px] text-text-muted">Nouveau défi chaque lundi.</p>
        </div>
      </div>
    </div>
  )
}
