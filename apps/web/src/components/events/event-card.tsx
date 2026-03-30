import Image from 'next/image'
import Link from 'next/link'
import { cn, formatPriceRange, formatEventDate } from '@/lib/utils'
import { SaveButton } from './save-button'
import type { EventWithRelations } from '@sortir/shared'

interface EventCardProps {
  event: EventWithRelations
  className?: string
}

export function EventCard({ event, className }: EventCardProps) {
  return (
    <Link
      href={`/evenements/${event.slug}`}
      className={cn(
        'group block rounded-lg bg-surface shadow-sm hover:shadow-md transition-all duration-150',
        'hover:-translate-y-0.5',
        className
      )}
    >
      {/* Image */}
      <div className="relative aspect-[16/9] overflow-hidden rounded-t-lg bg-border">
        {event.imageUrl ? (
          <Image
            src={event.imageUrl}
            alt={event.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 300px"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl text-text-muted">
            {event.category?.icon ?? '🎭'}
          </div>
        )}

        {/* Badges overlay */}
        <div className="absolute bottom-2 left-2 flex gap-1.5">
          {event.isFree && (
            <span className="rounded-full bg-free/90 px-2.5 py-0.5 text-xs font-medium text-white">
              Gratuit
            </span>
          )}
        </div>

        {/* Save button overlay */}
        <div className="absolute right-2 top-2" onClick={(e) => e.preventDefault()}>
          <SaveButton eventId={event.id} />
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {/* Category + zone */}
        <p className="text-xs text-text-muted">
          {event.category?.name}
          {event.venue?.arrondissement && ` · ${event.venue.arrondissement}`}
        </p>

        {/* Title */}
        <h3 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-text-primary">
          {event.title}
        </h3>

        {/* Date */}
        <p className="mt-1.5 text-sm text-text-secondary">
          {formatEventDate(new Date(event.startDate))}
        </p>

        {/* Price */}
        <p
          className={cn(
            'mt-0.5 text-sm font-medium',
            event.isFree ? 'text-free' : 'text-text-secondary'
          )}
        >
          {formatPriceRange(event.priceMin, event.priceMax, event.isFree)}
        </p>
      </div>
    </Link>
  )
}
