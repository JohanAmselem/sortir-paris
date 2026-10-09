import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { EventImage } from '@/components/ui/event-image'
import { SaveButton } from './save-button'
import { formatPrice } from '@/lib/format'
import { formatFilmTimes, formatWhen, isLongRun, urgencyBadge } from '@/lib/paris-time'
import { cn } from '@/lib/utils'
import type { CardEvent } from '@/lib/events/types'

/**
 * Event cards. Information order follows how people decide:
 *   1. WHEN (relative, in Paris time)  2. WHAT  3. WHERE (venue + arr.)
 *   4. PRICE (free / paid / unknown)    5. WHY (reason badge, optional)
 * Server component: only the save button hydrates.
 */

/** 'compact': a row on mobile, a poster from `sm` up (long listings). */
type Variant = 'poster' | 'row' | 'feature' | 'tile' | 'compact'

interface EventCardProps {
  event: CardEvent
  variant?: Variant
  className?: string
  priority?: boolean
  /** Shown before the title in ranked lists ("1", "2"…). */
  rank?: number
  now?: Date
  showSave?: boolean
}

/** "11e" in Paris, the town name outside (Montreuil, Saint-Denis…). */
export function venueArea(venue: CardEvent['venue']): string | null {
  if (!venue) return null
  return venue.arrondissement ?? venue.city ?? null
}

/** "12 séances · 8 salles" for a film card. */
export function filmCounts(film: NonNullable<CardEvent['film']>): string {
  const seances = `${film.seances} séance${film.seances > 1 ? 's' : ''}`
  return film.salles > 1 ? `${seances} · ${film.salles} salles` : seances
}

function Where({ event, className }: { event: CardEvent; className?: string }) {
  if (event.film) {
    return (
      <p className={cn('flex min-w-0 items-center gap-1 text-[13px] text-text-secondary', className)}>
        <span className="truncate">{event.film.salles > 1 ? filmCounts(event.film) : `${event.venue?.name ?? ''} · ${filmCounts(event.film)}`}</span>
      </p>
    )
  }
  if (!event.venue) return null
  const area = venueArea(event.venue)
  return (
    <p className={cn('flex min-w-0 items-center gap-1 text-[13px] text-text-secondary', className)}>
      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{event.venue.name}</span>
      {area && <span className="shrink-0 text-text-muted">· {area}</span>}
    </p>
  )
}

function Price({ event, className }: { event: CardEvent; className?: string }) {
  const { label, tone } = formatPrice(event)
  if (tone === 'unknown') return null
  return (
    <span className={cn('text-[13px] font-semibold', tone === 'free' ? 'text-free' : 'text-ink', className)}>
      {label}
    </span>
  )
}

function whenTone(event: CardEvent, now: Date) {
  const label = (event.film && formatFilmTimes(event.film.nextTimes, now)) || formatWhen(event, now)
  const hot = /^(Ce soir|En ce moment|Dernier jour|Plus que)/.test(label)
  return { label, hot }
}

export function EventCard({ event, variant = 'poster', className, priority, rank, now = new Date(), showSave = true }: EventCardProps) {
  const href = event.film ? `/films/${event.film.slug}` : `/evenements/${event.slug}`
  const when = whenTone(event, now)
  const badge = urgencyBadge(event, now)

  if (variant === 'row') {
    return (
      <article className={cn('group relative flex gap-3 py-3', className)}>
        <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-md bg-paper-deep">
          <EventImage src={event.imageUrl} alt="" sizes="72px" categorySlug={event.category?.slug} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn('text-[13px] font-semibold', when.hot ? 'text-accent' : 'text-text-secondary')}>{when.label}</p>
          <h3 className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-ink">
            <Link href={href} className="after:absolute after:inset-0 group-hover:underline group-hover:decoration-1 group-hover:underline-offset-2">
              {event.title}
            </Link>
          </h3>
          <div className="mt-1 flex items-center gap-2">
            <Where event={event} className="min-w-0 flex-1" />
            <Price event={event} className="shrink-0" />
          </div>
          {event.reason && <p className="mt-1 text-[12px] text-accent">{event.reason}</p>}
        </div>
      </article>
    )
  }

  if (variant === 'feature') {
    return (
      <article className={cn('group relative overflow-hidden rounded-xl bg-night text-paper', className)}>
        <div className="relative aspect-[5/4] sm:aspect-[16/10]">
          <EventImage
            src={event.imageUrl}
            alt=""
            sizes="(max-width: 640px) 100vw, 640px"
            priority={priority}
            categorySlug={event.category?.slug}
            className="transition-transform duration-700 ease-[var(--ease-out-quart)] group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-night via-night/45 to-transparent" />
          {showSave && (
            <div className="absolute right-3 top-3 z-10">
              <SaveButton eventId={event.id} />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 p-5">
            {/* The rank sits on the same line as the time: it can never cover it. */}
            <p className={cn('flex items-baseline gap-3 text-[14px] font-semibold', when.hot ? 'text-accent-glow' : 'text-paper/80')}>
              {rank != null && (
                <span className="font-display text-[2.6rem] leading-none text-paper" aria-label={`Numéro ${rank}`}>
                  {rank}
                </span>
              )}
              <span>{when.label}</span>
            </p>
            <h3 className="font-display mt-1.5 text-[2rem] leading-[0.95] text-paper sm:text-[2.4rem]">
              <Link href={href} className="after:absolute after:inset-0">
                {event.title}
              </Link>
            </h3>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-paper/80">
              {event.film ? (
                <span>{filmCounts(event.film)}</span>
              ) : (
                event.venue && (
                  <span>
                    {event.venue.name}
                    {venueArea(event.venue) ? ` · ${venueArea(event.venue)}` : ''}
                  </span>
                )
              )}
              {formatPrice(event).tone !== 'unknown' && (
                <span className={cn('font-semibold', formatPrice(event).tone === 'free' ? 'text-[oklch(0.82_0.12_160)]' : 'text-paper')}>
                  {formatPrice(event).label}
                </span>
              )}
            </div>
            {event.reason && <p className="mt-2 text-[13px] text-accent-glow">{event.reason}</p>}
          </div>
        </div>
      </article>
    )
  }

  if (variant === 'tile') {
    // Tall poster tile for exhibitions / runs.
    return (
      <article className={cn('group relative w-[180px] sm:w-[200px]', className)}>
        <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-paper-deep">
          <EventImage
            src={event.imageUrl}
            alt=""
            sizes="200px"
            categorySlug={event.category?.slug}
            className="transition-transform duration-500 group-hover:scale-[1.04]"
          />
          {badge && (
            <span className="absolute left-2 top-2 rounded bg-neon px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-paper">
              {badge}
            </span>
          )}
        </div>
        <h3 className="mt-2 line-clamp-2 text-[15px] font-semibold leading-snug text-ink">
          <Link href={href} className="after:absolute after:inset-0">
            {event.title}
          </Link>
        </h3>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-text-secondary">{event.film ? filmCounts(event.film) : event.venue?.name}</p>
        <p className={cn('mt-0.5 text-[13px]', when.hot ? 'font-semibold text-neon' : 'text-text-muted')}>
          {isLongRun(event) ? when.label.replace(/^En cours · /, '') : when.label}
        </p>
      </article>
    )
  }

  if (variant === 'compact') {
    // Mobile: dense row (about 5 per screen). From `sm`: the poster card.
    return (
      <article className={cn('group relative flex gap-3 py-3 sm:flex-col sm:gap-0 sm:py-0', className)}>
        <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-md bg-paper-deep sm:aspect-[3/2] sm:h-auto sm:w-full sm:rounded-lg">
          <EventImage
            src={event.imageUrl}
            alt=""
            sizes="(max-width: 640px) 72px, (max-width: 1024px) 45vw, 300px"
            priority={priority}
            categorySlug={event.category?.slug}
            className="transition-transform duration-500 ease-[var(--ease-out-quart)] sm:group-hover:scale-[1.04]"
          />
          <div className="absolute left-2 top-2 hidden gap-1.5 sm:flex">
            {event.priceStatus === 'free' && (
              <span className="rounded bg-free px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-paper">Gratuit</span>
            )}
            {badge && (
              <span className="rounded bg-ink/80 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-paper">{badge}</span>
            )}
          </div>
          {showSave && (
            <div className="absolute right-2 top-2 z-10 hidden sm:block">
              <SaveButton eventId={event.id} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 sm:mt-2.5">
          <p className={cn('text-[13px] font-semibold', when.hot ? 'text-accent' : 'text-text-secondary')}>{when.label}</p>
          <h3 className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-ink sm:min-h-[2lh] sm:text-[16px]">
            <Link href={href} className="after:absolute after:inset-0 group-hover:underline group-hover:decoration-1 group-hover:underline-offset-2">
              {event.title}
            </Link>
          </h3>
          <div className="mt-1 flex items-center gap-2">
            <Where event={event} className="min-w-0 flex-1" />
            <Price event={event} className="shrink-0" />
          </div>
          {event.reason && <p className="mt-1 text-[12px] font-medium text-accent">{event.reason}</p>}
        </div>
      </article>
    )
  }

  // Poster (default): image + compact info block.
  return (
    <article className={cn('group relative flex flex-col', className)}>
      <div className="relative aspect-[3/2] overflow-hidden rounded-lg bg-paper-deep">
        <EventImage
          src={event.imageUrl}
          alt=""
          sizes="(max-width: 640px) 85vw, (max-width: 1024px) 45vw, 300px"
          priority={priority}
          categorySlug={event.category?.slug}
          className="transition-transform duration-500 ease-[var(--ease-out-quart)] group-hover:scale-[1.04]"
        />
        <div className="absolute left-2 top-2 flex gap-1.5">
          {event.priceStatus === 'free' && (
            <span className="rounded bg-free px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-paper">Gratuit</span>
          )}
          {badge && (
            <span className="rounded bg-ink/80 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-paper">{badge}</span>
          )}
        </div>
        {showSave && (
          <div className="absolute right-2 top-2 z-10">
            <SaveButton eventId={event.id} />
          </div>
        )}
      </div>
      <div className="mt-2.5 min-w-0">
        <p className={cn('text-[13px] font-semibold', when.hot ? 'text-accent' : 'text-text-secondary')}>{when.label}</p>
        {/* Two lines reserved: cards of a row keep the same height. */}
        <h3 className="mt-0.5 line-clamp-2 min-h-[2lh] text-[16px] font-semibold leading-snug text-ink">
          <Link href={href} className="after:absolute after:inset-0 group-hover:underline group-hover:decoration-1 group-hover:underline-offset-2">
            {event.title}
          </Link>
        </h3>
        <div className="mt-1 flex items-center gap-2">
          <Where event={event} className="min-w-0 flex-1" />
          {event.priceStatus !== 'free' && <Price event={event} className="shrink-0" />}
        </div>
        {event.reason && <p className="mt-1 text-[12px] font-medium text-accent">{event.reason}</p>}
      </div>
    </article>
  )
}
