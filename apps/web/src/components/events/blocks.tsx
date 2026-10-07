import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { EventCard } from './event-card'
import type { CardEvent } from '@/lib/events/types'
import { cn } from '@/lib/utils'

export function SectionHeader({
  title,
  kicker,
  href,
  linkLabel = 'Tout voir',
  id,
  className,
  tone = 'light',
}: {
  title: string
  kicker?: string
  href?: string
  linkLabel?: string
  id?: string
  className?: string
  tone?: 'light' | 'dark'
}) {
  return (
    <div className={cn('flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {kicker && (
          <p className={cn('text-[13px] font-semibold uppercase tracking-[0.12em]', tone === 'dark' ? 'text-accent-glow' : 'text-accent')}>
            {kicker}
          </p>
        )}
        <h2 id={id} className={cn('font-display mt-1 text-[2rem] sm:text-[2.6rem]', tone === 'dark' ? 'text-paper' : 'text-ink')}>
          {title}
        </h2>
      </div>
      {href && (
        <Link
          href={href}
          className={cn(
            'mb-1 inline-flex h-10 shrink-0 items-center gap-1 text-[14px] font-semibold',
            tone === 'dark' ? 'text-paper/85 hover:text-paper' : 'text-accent hover:text-accent-hover'
          )}
        >
          {linkLabel}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  )
}

/** Horizontal rail on mobile, grid on desktop. */
export function EventRail({
  events,
  variant = 'poster',
  now,
  className,
}: {
  events: CardEvent[]
  variant?: 'poster' | 'tile'
  now: Date
  className?: string
}) {
  if (variant === 'tile') {
    return (
      <div className={cn('rail scrollbar-hide pb-2', className)}>
        {events.map((e) => (
          <EventCard key={e.id} event={e} variant="tile" now={now} />
        ))}
      </div>
    )
  }
  return (
    <div
      className={cn(
        'rail scrollbar-hide pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-x-5 sm:gap-y-8 sm:overflow-visible sm:px-0 lg:grid-cols-4',
        className
      )}
    >
      {events.map((e) => (
        <EventCard key={e.id} event={e} now={now} className="w-[78vw] max-w-[300px] sm:w-auto sm:max-w-none" />
      ))}
    </div>
  )
}

export function EventGrid({ events, now, className }: { events: CardEvent[]; now: Date; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', className)}>
      {events.map((e, i) => (
        <EventCard key={e.id} event={e} now={now} priority={i < 2} />
      ))}
    </div>
  )
}

export function EventList({ events, now, className }: { events: CardEvent[]; now: Date; className?: string }) {
  return (
    <div className={cn('divide-y divide-border', className)}>
      {events.map((e) => (
        <EventCard key={e.id} event={e} variant="row" now={now} />
      ))}
    </div>
  )
}

export function EmptyState({
  title,
  children,
  actions,
  className,
}: {
  title: string
  children?: React.ReactNode
  actions?: Array<{ href: string; label: string }>
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border border-dashed border-border-strong px-5 py-10 text-center', className)}>
      <p className="font-display text-[1.8rem] text-ink">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-[15px] text-text-secondary">{children}</div>}
      {actions && actions.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="inline-flex h-11 items-center rounded-full border border-border-strong bg-surface px-4 text-[14px] font-semibold text-ink transition-colors hover:border-ink"
            >
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/** Shown when a data source failed: never a raw error. */
export function DataUnavailable({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border bg-surface p-4 text-[15px] text-text-secondary', className)} role="status">
      Cette sélection n’a pas pu être chargée. Recharge la page dans un instant.
    </div>
  )
}
