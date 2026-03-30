import Image from 'next/image'
import Link from 'next/link'
import { cn, formatPriceRange, formatEventDate } from '@/lib/utils'
import type { EventWithRelations } from '@sortir/shared'

interface EventCardCompactProps {
  event: EventWithRelations
  className?: string
}

export function EventCardCompact({ event, className }: EventCardCompactProps) {
  return (
    <Link
      href={`/evenements/${event.slug}`}
      className={cn(
        'flex gap-3 rounded-lg bg-surface p-3 shadow-sm hover:shadow-md transition-all duration-150',
        className
      )}
    >
      {/* Thumbnail */}
      <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-md bg-border">
        {event.imageUrl ? (
          <Image
            src={event.imageUrl}
            alt={event.title}
            fill
            className="object-cover"
            sizes="80px"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl text-text-muted">
            {event.category?.icon ?? '🎭'}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <p className="text-xs text-text-muted">
          {event.category?.name}
          {event.venue?.arrondissement && ` · ${event.venue.arrondissement}`}
        </p>
        <h3 className="line-clamp-1 text-sm font-semibold text-text-primary">
          {event.title}
        </h3>
        <p className="mt-0.5 text-xs text-text-secondary">
          {formatEventDate(new Date(event.startDate))}
          {' · '}
          <span className={event.isFree ? 'text-free font-medium' : ''}>
            {formatPriceRange(event.priceMin, event.priceMax, event.isFree)}
          </span>
        </p>
      </div>
    </Link>
  )
}
