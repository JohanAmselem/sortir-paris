import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { EventCard } from './event-card'
import type { CardEvent } from '@/lib/events/types'
import { cn } from '@/lib/utils'

/** Titre de section : un titre, un lien « Tout voir » à droite. Plus de surtitre en série. */
export function SectionHeader({
  title,
  sub,
  href,
  linkLabel = 'Tout voir',
  id,
  className,
}: {
  title: string
  sub?: string
  href?: string
  linkLabel?: string
  id?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 id={id} className="t-title2 text-ink">
          {title}
        </h2>
        {sub && <p className="t-small mt-1 text-text-muted">{sub}</p>}
      </div>
      {href && (
        <Link href={href} className="t-small inline-flex min-h-11 shrink-0 items-center gap-1 font-semibold text-accent hover:text-accent-hover">
          {linkLabel}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  )
}

/** Rail horizontal de cartes (défile au doigt sur mobile, grille sur grand écran). */
export function EventRail({
  events,
  now,
  className,
  dateBox = false,
}: {
  events: CardEvent[]
  now: Date
  className?: string
  dateBox?: boolean
}) {
  return (
    <ul className={cn('rail scrollbar-hide pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-x-5 lg:gap-y-8 lg:overflow-visible lg:px-0', className)}>
      {events.map((e) => (
        <li key={e.id} className="w-[min(220px,62vw)] sm:w-[260px] lg:w-auto">
          <EventCard event={e} variant="card" now={now} dateBox={dateBox} />
        </li>
      ))}
    </ul>
  )
}

/** Liste de lignes (vignette de 76 px). */
export function EventList({ events, now, className, timeOnly = false }: { events: CardEvent[]; now: Date; className?: string; timeOnly?: boolean }) {
  return (
    <ul className={cn('divide-y divide-border', className)}>
      {events.map((e) => (
        <li key={e.id}>
          <EventCard event={e} variant="row" now={now} timeOnly={timeOnly} />
        </li>
      ))}
    </ul>
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
    <div className={cn('rounded-2xl border border-dashed border-border-strong px-5 py-10 text-center', className)}>
      <p className="t-title2 text-ink">{title}</p>
      {children && <div className="t-body mx-auto mt-2 max-w-md text-text-secondary">{children}</div>}
      {actions && actions.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="t-small inline-flex h-11 items-center rounded-full border border-border-strong px-4 font-semibold text-ink transition-colors hover:border-ink"
            >
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/** Quand une source de données a échoué : jamais d'erreur brute. */
export function DataUnavailable({ className }: { className?: string }) {
  return (
    <div className={cn('t-body rounded-xl border border-border bg-surface p-4 text-text-secondary', className)} role="status">
      Cette sélection n’a pas pu être chargée. Recharge la page dans un instant.
    </div>
  )
}

/** En-tête de page simple (pages de référencement, lieux, compte). */
export function PageIntro({ kicker, title, children, className }: { kicker?: string | null; title: string; children?: React.ReactNode; className?: string }) {
  return (
    <header className={cn('pb-5 pt-6 md:pt-10', className)}>
      {kicker && <p className="t-micro text-text-muted">{kicker}</p>}
      <h1 className="t-display mt-1 text-ink">{title}</h1>
      {children && <div className="t-body mt-3 max-w-2xl text-text-secondary">{children}</div>}
    </header>
  )
}
