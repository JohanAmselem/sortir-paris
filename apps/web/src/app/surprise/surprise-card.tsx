'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Calendar, MapPin, ExternalLink, RefreshCw } from 'lucide-react'
import type { EventWithRelations } from '@sortir/shared'

export function SurpriseCard({ event }: { event: EventWithRelations }) {
  const router = useRouter()
  const [spinning, setSpinning] = useState(false)

  const startDate = event.startDate ? new Date(event.startDate) : null
  const dateLabel = startDate
    ? startDate.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : null

  const handleRefresh = () => {
    setSpinning(true)
    router.refresh()
    setTimeout(() => setSpinning(false), 600)
  }

  return (
    <div className="mt-8 w-full max-w-md">
      {/* Card */}
      <Link
        href={`/evenements/${event.slug}`}
        className="group block overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-xl transition-all hover:shadow-2xl hover:border-accent/30"
      >
        {/* Image */}
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface-hover">
          {event.imageUrl ? (
            <Image
              src={event.imageUrl}
              alt={event.title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 448px) 100vw, 448px"
              priority
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-accent/10 to-neon/10">
              <span className="text-7xl">{event.category?.icon ?? '🎭'}</span>
            </div>
          )}

          {/* Category badge */}
          {event.category && (
            <div className="absolute top-3 left-3 rounded-lg bg-black/60 px-2.5 py-1 backdrop-blur-sm">
              <span className="text-[11px] font-bold text-white">
                {event.category.icon} {event.category.name}
              </span>
            </div>
          )}

          {event.isFree && (
            <div className="absolute top-3 right-3 rounded-lg bg-free/90 px-2.5 py-1">
              <span className="text-[11px] font-bold text-white">Gratuit</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-5">
          <h2 className="text-xl font-bold text-text-primary leading-tight group-hover:text-accent transition-colors">
            {event.title}
          </h2>

          {event.shortDesc && (
            <p className="mt-2 text-[13px] text-text-secondary line-clamp-2">
              {event.shortDesc}
            </p>
          )}

          <div className="mt-4 space-y-2">
            {dateLabel && (
              <div className="flex items-center gap-2 text-[13px] text-text-muted">
                <Calendar className="h-3.5 w-3.5 text-accent" />
                <span className="capitalize">{dateLabel}</span>
              </div>
            )}
            {event.venue && (
              <div className="flex items-center gap-2 text-[13px] text-text-muted">
                <MapPin className="h-3.5 w-3.5 text-neon" />
                <span>{event.venue.name}</span>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-accent">
            <ExternalLink className="h-3.5 w-3.5" />
            Voir les détails
          </div>
        </div>
      </Link>

      {/* Refresh button */}
      <button
        onClick={handleRefresh}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-3 text-[14px] font-semibold text-text-primary shadow-sm transition-all hover:bg-surface-hover hover:shadow-md active:scale-[0.98]"
      >
        <RefreshCw className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`} />
        Autre suggestion
      </button>
    </div>
  )
}
