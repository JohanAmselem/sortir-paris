import Link from 'next/link'
import { ArrowRight, BellRing, Clock } from 'lucide-react'
import { EventList } from '@/components/events/blocks'
import { formatWhen } from '@/lib/paris-time'
import type { FollowGroup, LastDate } from '@/lib/follows'
import { MarkSeenButton } from './mark-seen-button'

/** « Nouveautés pour toi », grouped by follow, each with « Marquer comme vu ». */
export function NewForYou({ groups, now }: { groups: FollowGroup[]; now: Date }) {
  if (!groups.length) {
    return (
      <p className="text-[15px] text-text-secondary">
        Rien de nouveau depuis ta dernière visite. Dès qu’une date est ajoutée pour ce que tu suis, elle apparaît ici.
      </p>
    )
  }
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.follow.id} aria-label={`Nouveautés : ${g.follow.label}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-[15px] font-semibold text-ink">
              <span className="truncate">{g.follow.label}</span>
              <span className="ml-2 text-[13px] font-normal text-text-secondary">
                {g.matches.length} nouvelle{g.matches.length > 1 ? 's' : ''} date{g.matches.length > 1 ? 's' : ''}
              </span>
            </p>
            <MarkSeenButton id={g.follow.id} />
          </div>
          <EventList events={g.matches.map((m) => m.event)} now={now} className="mt-2 rounded-xl border border-border bg-surface px-3" />
        </section>
      ))}
    </div>
  )
}

/** « Dernières dates »: followed items starting within 7 days. */
export function LastDates({ items, now }: { items: LastDate[]; now: Date }) {
  if (!items.length) return null
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {items.map(({ follow, event }) => (
        <li key={event.id}>
          <Link href={`/evenements/${event.slug}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover">
            <Clock className="h-4 w-4 shrink-0 text-neon" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-ink">{event.title}</span>
              <span className="block truncate text-[13px] text-text-secondary">
                {formatWhen(event, now)}
                {event.venue && ` · ${event.venue.name}`} · tu suis {follow.label}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Compact block for the Club hub. */
export function NewForYouTeaser({ groups, followCount }: { groups: FollowGroup[]; followCount: number }) {
  const total = groups.reduce((s, g) => s + g.matches.length, 0)
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start gap-3">
        <BellRing className="mt-1 h-5 w-5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          {followCount === 0 ? (
            <>
              <p className="text-[15px] font-semibold text-ink">Suis tes lieux et tes artistes</p>
              <p className="mt-1 text-[14px] text-text-secondary">
                Sur la page d’un lieu ou d’un événement, appuie sur « Suivre » : leurs nouvelles dates arriveront ici.
              </p>
            </>
          ) : total === 0 ? (
            <>
              <p className="text-[15px] font-semibold text-ink">Rien de nouveau pour l’instant</p>
              <p className="mt-1 text-[14px] text-text-secondary">
                Tu suis {followCount} lieu{followCount > 1 ? 'x' : ''} ou artiste{followCount > 1 ? 's' : ''}. On te montre ici leurs nouvelles dates.
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-semibold text-ink">
                {total} nouvelle{total > 1 ? 's' : ''} date{total > 1 ? 's' : ''} pour ce que tu suis
              </p>
              <ul className="mt-2 space-y-1">
                {groups.slice(0, 3).map((g) => (
                  <li key={g.follow.id} className="truncate text-[14px] text-text-secondary">
                    <span className="font-semibold text-ink">{g.follow.label}</span> : {g.matches[0].event.title}
                    {g.matches.length > 1 && ` et ${g.matches.length - 1} autre${g.matches.length > 2 ? 's' : ''}`}
                  </li>
                ))}
              </ul>
            </>
          )}
          <Link href="/compte#nouveautes" className="mt-3 inline-flex h-10 items-center gap-1 text-[14px] font-semibold text-accent hover:text-accent-hover">
            {followCount === 0 ? 'Mon compte' : 'Voir les nouveautés'}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  )
}
