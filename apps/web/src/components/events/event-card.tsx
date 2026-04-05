'use client'

import Image from 'next/image'
import Link from 'next/link'
import { cn, formatPriceRange, formatEventDate } from '@/lib/utils'
import { Countdown } from '@/components/ui/countdown'
import { SaveButton } from './save-button'
import { MapPin, Heart } from 'lucide-react'
import type { EventWithRelations } from '@sortir/shared'

interface EventCardProps {
  event: EventWithRelations
  className?: string
  variant?: 'default' | 'compact' | 'featured'
  showSave?: boolean
}

export function EventCard({ event, className, variant = 'default', showSave = true }: EventCardProps) {
  const startDate = event.startDate ? new Date(event.startDate) : null
  const isToday = startDate && startDate.toDateString() === new Date().toDateString()
  const isSoon = startDate && (startDate.getTime() - Date.now()) < 12 * 60 * 60 * 1000 && startDate.getTime() > Date.now()

  if (variant === 'compact') {
    return (
      <Link
        href={`/evenements/${event.slug}`}
        className={cn(
          'group flex gap-3 rounded-xl bg-surface p-2.5 transition-all duration-200',
          'hover:shadow-md active:scale-[0.98]',
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
          {isSoon && startDate && (
            <div className="absolute bottom-0 left-0 right-0 bg-accent/90 px-1.5 py-0.5 text-center">
              <Countdown targetDate={startDate} className="text-[9px] font-bold text-white" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          <h3 className="line-clamp-1 text-[13px] font-semibold text-text-primary group-hover:text-accent transition-colors">
            {event.title}
          </h3>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {startDate ? formatEventDate(startDate) : ''}
          </p>
          {event.venue?.name && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-text-muted truncate">
              <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
              {event.venue.name}
            </p>
          )}
          <p className={cn(
            'mt-1 text-[11px] font-bold',
            event.isFree ? 'text-free' : 'text-text-primary'
          )}>
            {formatPriceRange(event.priceMin, event.priceMax, event.isFree)}
          </p>
        </div>
      </Link>
    )
  }

  if (variant === 'featured') {
    return (
      <Link
        href={`/evenements/${event.slug}`}
        className={cn(
          'group relative block overflow-hidden rounded-2xl bg-primary transition-all duration-300',
          'shadow-lg hover:shadow-xl hover:-translate-y-1',
          className
        )}
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          {event.imageUrl ? (
            <Image
              src={event.imageUrl}
              alt={event.title}
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-110"
              sizes="(max-width: 768px) 90vw, 400px"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-accent/20 to-neon/20">
              <span className="text-6xl opacity-40">{event.category?.icon ?? '🎭'}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* Content overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-5">
            {event.category?.name && (
              <span className="inline-block rounded-md bg-accent px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                {event.category.name}
              </span>
            )}
            <h3 className="mt-2 line-clamp-2 text-lg font-bold text-white leading-snug">
              {event.title}
            </h3>
            <div className="mt-2 flex items-center gap-3 text-[12px] text-white/70">
              <span>{startDate ? formatEventDate(startDate) : ''}</span>
              {event.venue?.name && (
                <>
                  <span>·</span>
                  <span className="truncate">{event.venue.name}</span>
                </>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className={cn(
                'text-[13px] font-bold',
                event.isFree ? 'text-free' : 'text-white'
              )}>
                {formatPriceRange(event.priceMin, event.priceMax, event.isFree)}
              </span>
              {isSoon && startDate && (
                <Countdown targetDate={startDate} className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm" />
              )}
            </div>
          </div>
        </div>
      </Link>
    )
  }

  // Default variant
  return (
    <Link
      href={`/evenements/${event.slug}`}
      className={cn(
        'group block overflow-hidden rounded-2xl bg-surface transition-all duration-300',
        'shadow-sm hover:shadow-lg hover:-translate-y-0.5',
        'active:scale-[0.98]',
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
            <span className="text-5xl opacity-40">{event.category?.icon ?? '🎭'}</span>
          </div>
        )}

        {/* Top badges */}
        <div className="absolute top-2.5 left-2.5 flex gap-1.5">
          {event.isFree && (
            <span className="rounded-md bg-free px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider shadow-sm">
              Gratuit
            </span>
          )}
          {isToday && (
            <span className="rounded-md bg-accent px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider shadow-sm">
              Ce soir
            </span>
          )}
        </div>

        {/* Save button — stopPropagation prevents Link navigation */}
        {showSave && (
          <div
            className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
            onClick={(e) => e.preventDefault()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <SaveButton
              eventId={event.id}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 backdrop-blur-sm shadow-sm hover:bg-white"
            />
          </div>
        )}

        {/* Countdown badge */}
        {isSoon && startDate && (
          <div className="absolute bottom-2.5 right-2.5">
            <Countdown
              targetDate={startDate}
              className="rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm"
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3.5">
        {event.category?.name && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
            {event.category.name}
          </span>
        )}

        <h3 className="mt-1 line-clamp-2 text-[14px] font-semibold leading-snug text-text-primary group-hover:text-accent transition-colors duration-200">
          {event.title}
        </h3>

        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-text-muted">
          <span>{startDate ? formatEventDate(startDate) : ''}</span>
        </div>

        {event.venue?.name && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-text-muted truncate">
            <MapPin className="h-2.5 w-2.5 flex-shrink-0 text-text-muted" />
            {event.venue.name}
          </p>
        )}

        <div className="mt-2 flex items-center justify-between">
          <p className={cn(
            'text-[13px] font-bold',
            event.isFree ? 'text-free' : 'text-text-primary'
          )}>
            {formatPriceRange(event.priceMin, event.priceMax, event.isFree)}
          </p>
          {event.saveCount > 2 && (
            <span className="flex items-center gap-1 text-[10px] text-text-muted">
              <Heart className="h-2.5 w-2.5" />
              {event.saveCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
