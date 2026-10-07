import Link from 'next/link'
import { Lock } from 'lucide-react'
import { BADGES, getXpProgress, type MemberStats } from '@/lib/gamification'
import { cn } from '@/lib/utils'

/** Level + XP bar. Server-safe (no hooks). */
export function LevelMeter({ xp, className, tone = 'light' }: { xp: number; className?: string; tone?: 'light' | 'dark' }) {
  const p = getXpProgress(xp)
  const dark = tone === 'dark'
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn('font-display text-[1.7rem]', dark ? 'text-paper' : 'text-ink')}>
          Niveau {p.current.level} · {p.current.name}
        </p>
        <p className={cn('text-[13px] font-semibold tabular-nums', dark ? 'text-paper/80' : 'text-text-secondary')}>{xp} XP</p>
      </div>
      <div
        className={cn('mt-2 h-2.5 overflow-hidden rounded-full', dark ? 'bg-paper/15' : 'bg-paper-deep')}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p.progress}
        aria-label={p.next ? `Progression vers le niveau ${p.next.level}` : 'Niveau maximum atteint'}
      >
        <div className={cn('h-full rounded-full', dark ? 'bg-accent-glow' : 'bg-accent')} style={{ width: `${p.progress}%` }} />
      </div>
      <p className={cn('mt-1.5 text-[13px]', dark ? 'text-paper/75' : 'text-text-muted')}>
        {p.next ? `Encore ${p.xpNeeded - p.xpInLevel} XP pour devenir ${p.next.name}` : 'Niveau maximum atteint, chapeau.'}
      </p>
    </div>
  )
}

/** All badges: earned ones in colour, locked ones with their goal and progress. */
export function BadgeGrid({
  earned,
  stats,
  className,
}: {
  earned: string[]
  /** Null for anonymous visitors (no progress shown). */
  stats: MemberStats | null
  className?: string
}) {
  return (
    <ul className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5', className)}>
      {BADGES.map((b) => {
        const has = earned.includes(b.slug)
        const p = stats ? b.progress(stats) : null
        return (
          <li
            key={b.slug}
            className={cn(
              'flex min-h-[112px] flex-col rounded-xl border p-3',
              has ? 'border-accent bg-accent-soft' : 'border-border bg-surface'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className={cn('text-[22px] leading-none', !has && 'opacity-40 grayscale')} aria-hidden>
                {b.emoji}
              </span>
              {!has && <Lock className="h-3.5 w-3.5 text-text-muted" aria-label="À débloquer" />}
            </div>
            <p className={cn('mt-2 text-[14px] font-semibold', has ? 'text-accent' : 'text-ink')}>{b.name}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-text-secondary">{b.desc}</p>
            {!has && p && p.goal > 1 && (
              <p className="mt-auto pt-1 text-[12px] font-semibold tabular-nums text-text-muted">
                {p.value}/{p.goal}
              </p>
            )}
            <span className="sr-only">{has ? 'Badge obtenu' : 'Badge à débloquer'}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function StatTiles({ items, className }: { items: Array<{ label: string; value: number | string; href?: string }>; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4', className)}>
      {items.map((it) => {
        const inner = (
          <>
            <p className="text-[13px] text-text-secondary">{it.label}</p>
            <p className="font-display mt-1 text-[2rem] tabular-nums text-ink">{it.value}</p>
          </>
        )
        return (
          <div key={it.label} className="bg-surface">
            {it.href ? (
              <Link href={it.href} className="block h-full p-4 transition-colors hover:bg-surface-hover">
                {inner}
              </Link>
            ) : (
              <div className="p-4">{inner}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
