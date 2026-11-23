import Link from 'next/link'
import { MapPin, Sparkles } from 'lucide-react'
import { EventImage } from '@/components/ui/event-image'
import { SaveButton } from './save-button'
import { cardPrice } from '@/lib/format'
import { formatHour, premier } from '@/lib/agenda-view'
import { formatFilmTimes, formatWhen, isLongRun, parisParts, urgencyBadge } from '@/lib/paris-time'
import { cn } from '@/lib/utils'
import type { CardEvent } from '@/lib/events/types'

/**
 * LA carte de sortie du site, en 3 formats :
 *   - `poster` : grande photo, texte sur un dégradé (Notre choix) ;
 *   - `card`   : photo puis texte, pour les rails (avec `dateBox` : le pavé « 17 FÉVR. 27 ») ;
 *   - `row`    : ligne de liste, vignette de 76 px (Agenda, fiches, carte).
 * Ordre des informations : QUAND, QUOI, OÙ, PRIX, puis la raison. Composant
 * serveur : seul le bouton « Garder » s'hydrate.
 */
export type EventCardVariant = 'poster' | 'card' | 'row'

interface EventCardProps {
  event: CardEvent
  variant?: EventCardVariant
  className?: string
  priority?: boolean
  now?: Date
  showSave?: boolean
  /** Ligne : l'heure seule (le jour est dans l'en-tête de la liste). */
  timeOnly?: boolean
  /** Carte : pavé de date sur la photo (Les grosses dates). */
  dateBox?: boolean
}

/** « 11e » à Paris, le nom de la ville ailleurs (Montreuil, Saint-Denis…). */
export function venueArea(venue: CardEvent['venue']): string | null {
  if (!venue) return null
  return venue.arrondissement ?? venue.city ?? null
}

/** « 12 séances · 8 salles » pour une carte de film. */
export function filmCounts(film: NonNullable<CardEvent['film']>): string {
  const seances = `${film.seances} séance${film.seances > 1 ? 's' : ''}`
  return film.salles > 1 ? `${seances} · ${film.salles} salles` : seances
}

export function eventHref(event: CardEvent): string {
  return event.film ? `/films/${event.film.slug}` : `/evenements/${event.slug}`
}

/** « L’Olympia · 9e » ou « 12 séances · 8 salles ». */
export function whereLabel(event: CardEvent): string | null {
  if (event.film) return event.film.salles > 1 ? filmCounts(event.film) : [event.venue?.name, filmCounts(event.film)].filter(Boolean).join(' · ')
  if (!event.venue) return null
  const area = venueArea(event.venue)
  return area ? `${event.venue.name} · ${area}` : event.venue.name
}

function whenLabel(event: CardEvent, now: Date, timeOnly: boolean): string {
  if (event.film) return formatFilmTimes(event.film.nextTimes, now) || formatWhen(event, now)
  if (timeOnly && !isLongRun(event)) {
    const start = new Date(event.startDate)
    if (start <= now) return formatWhen(event, now)
    return event.timeKnown ? formatHour(start) : 'Horaire à venir'
  }
  return premier(formatWhen(event, now)).replace(/(\d{1,2})h(\d{2})?\b/g, (_, h: string, m?: string) => (m ? `${h}\u00a0h\u00a0${m}` : `${h}\u00a0h`))
}

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** Pavé de date : « 17 » et « févr. 27 » (l'année quand ce n'est pas l'année en cours). */
export function DateBox({ date, now, className }: { date: Date; now: Date; className?: string }) {
  const p = parisParts(date)
  const year = p.year !== parisParts(now).year ? ` ${String(p.year).slice(2)}` : ''
  return (
    <span className={cn('flex min-w-14 flex-col items-center rounded-lg bg-paper/90 px-2.5 pb-1.5 pt-1 text-center text-ink backdrop-blur', className)}>
      <span className="t-title1">{p.day}</span>
      <span className="t-micro mt-0.5">
        {MONTHS_SHORT[p.month - 1]}
        {year}
      </span>
    </span>
  )
}

function NewBadge({ onImage = false }: { onImage?: boolean }) {
  return (
    <span className={cn('t-micro inline-flex items-center gap-1 rounded-md px-2 py-1', onImage ? 'bg-neon text-paper' : 'bg-neon-soft text-neon')}>
      <Sparkles className="h-3 w-3" aria-hidden />
      Nouvelle date
    </span>
  )
}

function PriceLine({ event, className }: { event: CardEvent; className?: string }) {
  const price = cardPrice(event)
  return (
    <span className={cn('t-small', price.tone === 'free' ? 'font-semibold text-free' : price.tone === 'paid' ? 'font-semibold text-ink' : 'text-text-muted', className)}>
      {price.label}
    </span>
  )
}

export function EventCard({ event, variant = 'row', className, priority, now = new Date(), showSave = true, timeOnly = false, dateBox = false }: EventCardProps) {
  const href = eventHref(event)
  const when = whenLabel(event, now, timeOnly)
  const where = whereLabel(event)
  const hot = /^(Ce soir|En ce moment|Dernier jour|Plus que|Dans \d)/.test(when)
  const badge = urgencyBadge(event, now)
  const catSlug = event.category?.slug

  if (variant === 'poster') {
    const price = cardPrice(event)
    return (
      <article className={cn('group relative aspect-[4/5] overflow-hidden rounded-2xl bg-surface', className)}>
        <EventImage
          src={event.imageUrl}
          alt=""
          fallback="lg"
          fallbackTop
          sizes="(max-width: 640px) 80vw, (max-width: 1024px) 45vw, 380px"
          priority={priority}
          categorySlug={catSlug}
          className="transition-transform duration-700 ease-[var(--ease-out-quart)] group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-linear-to-b from-transparent from-35% to-surface-dark/90" aria-hidden />
        {showSave && (
          <div className="absolute right-3 top-3 z-10">
            <SaveButton eventId={event.id} />
          </div>
        )}
        {event.isNew && (
          <div className="absolute left-3 top-3 z-10">
            <NewBadge onImage />
          </div>
        )}
        <div className="absolute inset-x-4 bottom-4 text-ink">
          <p className="t-micro text-ink-soft">
            {when}
            {event.category ? ` · ${event.category.name}` : ''}
          </p>
          <h3 className="t-title2 mt-1.5 line-clamp-3">
            <Link href={href} className="after:absolute after:inset-0">
              {event.title}
            </Link>
          </h3>
          <p className="t-small mt-2 line-clamp-1 text-ink-soft">
            {[where, price.tone === 'unknown' ? null : price.label].filter(Boolean).join(' · ')}
          </p>
          {event.reason && (
            <p className="t-small mt-2.5 inline-flex rounded-full bg-ink/15 px-2.5 py-1 font-semibold text-ink backdrop-blur-md">{event.reason}</p>
          )}
        </div>
      </article>
    )
  }

  if (variant === 'card') {
    return (
      <article className={cn('group relative flex flex-col', className)}>
        <div className="relative aspect-[3/2] overflow-hidden rounded-xl bg-surface">
          <EventImage
            src={event.imageUrl}
            alt=""
            title={event.title}
            sizes="(max-width: 640px) 220px, 280px"
            priority={priority}
            categorySlug={catSlug}
            className="transition-transform duration-500 ease-[var(--ease-out-quart)] group-hover:scale-[1.04]"
          />
          {dateBox && <DateBox date={new Date(event.startDate)} now={now} className="absolute left-2.5 top-2.5" />}
          {!dateBox && (badge || event.isNew) && (
            <span className="absolute left-2.5 top-2.5 z-10">
              {event.isNew ? <NewBadge onImage /> : <span className="t-micro rounded-md bg-neon px-2 py-1 text-paper">{badge}</span>}
            </span>
          )}
          {showSave && (
            <div className="absolute right-2 top-2 z-10">
              <SaveButton eventId={event.id} />
            </div>
          )}
        </div>
        <div className="mt-2.5 min-w-0">
          {!dateBox && <p className={cn('t-small font-bold', hot ? 'text-neon' : 'text-accent')}>{when}</p>}
          <h3 className="t-body mt-0.5 line-clamp-2 font-bold leading-snug text-ink">
            <Link href={href} className="after:absolute after:inset-0 group-hover:underline group-hover:decoration-1 group-hover:underline-offset-2">
              {event.title}
            </Link>
          </h3>
          {where && (
            <p className="t-small mt-0.5 flex min-w-0 items-center gap-1 text-text-muted">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{where}</span>
            </p>
          )}
          {dateBox ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {event.isNew && <NewBadge />}
              <PriceLine event={event} />
            </div>
          ) : (
            <PriceLine event={event} className="mt-0.5 block" />
          )}
        </div>
      </article>
    )
  }

  // Ligne de liste.
  return (
    <article className={cn('group relative grid grid-cols-[76px_1fr_auto] items-center gap-3 py-3', className)}>
      <div className="relative h-[76px] w-[76px] overflow-hidden rounded-xl bg-surface">
        <EventImage src={event.imageUrl} alt="" title={event.title} fallback="sm" sizes="76px" categorySlug={catSlug} />
      </div>
      <div className="min-w-0">
        <p className={cn('t-small font-bold', hot ? 'text-neon' : 'text-accent')}>
          {when}
          {event.reason && <span className="font-semibold text-text-secondary"> · {event.reason}</span>}
        </p>
        <h3 className="t-body mt-0.5 line-clamp-2 font-bold leading-snug text-ink">
          <Link href={href} className="after:absolute after:inset-0 group-hover:underline group-hover:decoration-1 group-hover:underline-offset-2">
            {event.title}
          </Link>
        </h3>
        <p className="t-small mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-text-muted">
          {where && <span className="min-w-0 truncate">{where}</span>}
          <PriceLine event={event} />
          {event.distanceKm != null && <span>{event.distanceKm < 1 ? `${Math.round(event.distanceKm * 1000)} m` : `${event.distanceKm.toFixed(1).replace('.', ',')} km`}</span>}
        </p>
        {event.isNew && (
          <p className="mt-1.5">
            <NewBadge />
          </p>
        )}
      </div>
      {showSave ? <SaveButton eventId={event.id} appearance="plain" /> : <span aria-hidden />}
    </article>
  )
}
