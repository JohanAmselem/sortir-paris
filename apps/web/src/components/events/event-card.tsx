'use client'

import Image from 'next/image'
import Link from 'next/link'
import { cn, formatPriceRange, formatEventDate } from '@/lib/utils'
import { SaveButton } from './save-button'
import type { EventWithRelations } from '@sortir/shared'

interface EventCardProps {
  event: EventWithRelations
  className?: string
  variant?: 'default' | 'compact'
}

export function EventCard({ event, className, variant = 'default' }: EventCardProps) {
  if (variant === 'compact') {
    return (
      <Link
        href={`/evenements/${event.slug}`}
        className={cn(
          'group flex gap-3 rounded-xl bg-surface p-2.5 transition-all duration-200',
          'hover:shadow-md hover:bg-surface-hover/50',
          className
        )}
      >
        <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-surface-hover">
          {event.imageUrl ? (
            <Image
              src={event.imageUrl}
              alt={event.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="80px"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-2xl">
              {event.category?.icon ?? '🎭'}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          <h3 className="line-clamp-1 text-[13px] font-semibold text-text-primary">
            {event.title}
          </h3>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {event.startDate ? formatEventDate(new Date(event.startDate)) : ''}
          </p>
          {event.venue?.name && (
            <p className="mt-0.5 text-[11px] text-text-muted truncate">{event.venue.name}</p>
          )}
          <p className={cn(
            'mt-1 text-[11px] font-semibold',
            event.isFree ? 'text-free' : 'text-text-primary'
          )}>
            {formatPriceRange(event.priceMin, event.priceMax, event.isFree)}
          </p>
        </div>
      </Link>
    )
  }

  return (
    <Link
      href={`/evenements/${event.slug}`}
      className={cn(
        'group block overflow-hidden rounded-2xl bg-surface transition-all duration-300',
        'shadow-sm hover:shadow-lg hover:-translate-y-0.5',
        className
      )}
    >
      {/* Image */}
      <div className="relative aspect-[3/2] overflow-hidden bg-surface-hover">
        {event.imageUrl ? (
          <Image
            src={event.imageUrl}
            alt={event.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 300px"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-accent/5 to-neon/5">
            <span className="text-5xl opacity-50">{event.category?.icon ?? '🎭'}</span>
          </div>
        )}

        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex gap-1.5">
          {event.isFree && (
            <span className="rounded-md bg-free px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider shadow-sm">
              Gratuit
            </span>
          )}
        </div>

        {/* Save button */}
        <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={(e) => e.preventDefault()}>
          <SaveButton eventId={event.id} />
        </div>
      </div>

      {/* Content */}
      <div className="p-3.5">
        {/* Category tag */}
        {event.category?.name && (
          <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            {event.category.name}
          </span>
        )}

        {/* Title */}
        <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-text-primary group-hover:text-accent transition-colors duration-200">
          {event.title}
        </h3>

        {/* Date + Venue */}
        <div className="mt-2 flex items-center gap-1.5 text-[12px] text-text-muted">
          <span>{event.startDate ? formatEventDate(new Date(event.startDate)) : ''}</span>
          {event.venue?.name && (
            <>
              <span>·</span>
              <span className="truncate">{event.venue.name}</span>
            </>
          )}
        </div>

        {/* Price */}
        <p
          className={cn(
            'mt-2 text-[13px] font-bold',
            event.isFree ? 'text-free' : 'text-text-primary'
          )}
        >
          {formatPriceRange(event.priceMin, event.priceMax, event.isFree)}
        </p>
      </div>
    </Link>
  )
}
