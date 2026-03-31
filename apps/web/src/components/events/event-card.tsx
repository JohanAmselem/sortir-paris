'use client'

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
        'group block overflow-hidden rounded-xl bg-surface transition-all duration-200',
        'shadow-sm hover:shadow-lg hover:-translate-y-1',
        className
      )}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-hover">
        {event.imageUrl ? (
          <Image
            src={event.imageUrl}
            alt={event.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 300px"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-accent/10 to-neon/10">
            <span className="text-5xl opacity-60">{event.category?.icon ?? '🎭'}</span>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

        {/* Badges */}
        <div className="absolute bottom-2.5 left-2.5 flex gap-1.5">
          {event.isFree && (
            <span className="rounded-full bg-free px-2.5 py-0.5 text-[11px] font-bold text-white uppercase tracking-wide">
              Gratuit
            </span>
          )}
          {event.category?.name && (
            <span className="rounded-full bg-black/50 backdrop-blur-sm px-2.5 py-0.5 text-[11px] font-medium text-white">
              {event.category.name}
            </span>
          )}
        </div>

        {/* Save button */}
        <div className="absolute right-2.5 top-2.5" onClick={(e) => e.preventDefault()}>
          <SaveButton eventId={event.id} />
        </div>
      </div>

      {/* Content */}
      <div className="p-3.5">
        {/* Title */}
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-text-primary">
          {event.title}
        </h3>

        {/* Date + Venue */}
        <div className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
          <span>{event.startDate ? formatEventDate(new Date(event.startDate)) : ''}</span>
          {event.venue?.name && (
            <>
              <span className="text-border-strong">·</span>
              <span className="truncate">{event.venue.name}</span>
            </>
          )}
        </div>

        {/* Price */}
        <p
          className={cn(
            'mt-1.5 text-sm font-semibold',
            event.isFree ? 'text-free' : 'text-text-primary'
          )}
        >
          {formatPriceRange(event.priceMin, event.priceMax, event.isFree)}
        </p>
      </div>
    </Link>
  )
}
