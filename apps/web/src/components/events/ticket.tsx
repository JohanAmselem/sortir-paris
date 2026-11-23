import Link from 'next/link'
import { EventImage } from '@/components/ui/event-image'
import { eventHref } from './event-card'
import { formatHour } from '@/lib/agenda-view'
import { isLongRun, parisParts } from '@/lib/paris-time'
import { cn } from '@/lib/utils'
import type { Outing } from '@/lib/outings'

const WEEKDAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** Une sortie de « Mes sorties », comme un billet : la date à gauche, la sortie à droite. */
export function OutingTicket({ outing, now, past = false }: { outing: Outing; now: Date; past?: boolean }) {
  const e = outing.event
  const start = new Date(e.startDate)
  const running = isLongRun(e) && start <= now && e.endDate
  const shown = running ? new Date(e.endDate!) : start
  const p = parisParts(shown)
  const year = p.year !== parisParts(now).year ? ` ${p.year}` : ''
  const line = [running ? null : e.timeKnown ? formatHour(start) : null, e.venue?.name].filter(Boolean).join(' · ')

  return (
    <article className={cn('group relative grid grid-cols-[68px_1fr] overflow-hidden rounded-2xl border border-border bg-surface', past && 'opacity-80')}>
      <div className="flex flex-col items-center justify-center border-r border-dashed border-border-strong bg-surface-hover px-1 py-3 text-center text-ink">
        <span className="t-micro text-text-muted">{running ? 'jusqu’au' : WEEKDAYS[p.weekday]}</span>
        <span className="t-title1">{p.day}</span>
        <span className="t-micro text-text-muted">
          {MONTHS[p.month - 1]}
          {year}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_64px] items-center gap-3 p-3">
        <div className="min-w-0">
          {line && <p className="t-small truncate font-bold text-accent">{line}</p>}
          <h3 className="t-body mt-0.5 line-clamp-2 font-bold leading-snug text-ink">
            <Link href={eventHref(e)} className="after:absolute after:inset-0 group-hover:underline">
              {e.title}
            </Link>
          </h3>
          <p className="mt-1.5 flex flex-wrap gap-1.5">
            {outing.going && <span className="t-micro rounded-md bg-accent-soft px-2 py-1 text-accent">J’y vais</span>}
            {outing.saved && <span className="t-micro rounded-md bg-neon-soft px-2 py-1 text-neon">Gardée</span>}
          </p>
        </div>
        <div className="relative h-16 w-16 overflow-hidden rounded-xl bg-surface-hover">
          <EventImage src={e.imageUrl} alt="" title={e.title} fallback="sm" sizes="64px" categorySlug={e.category?.slug} />
        </div>
      </div>
    </article>
  )
}
