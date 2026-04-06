'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Calendar, MapPin, Sparkles, Loader2, Flame, ArrowRight, Gift, ExternalLink } from 'lucide-react'
import { formatEventDate, formatPriceRange, cn } from '@/lib/utils'
import { SaveButton } from '@/components/events/save-button'
import { AttendButton } from '@/components/events/attend-button'

interface DropEvent {
  id: string
  title: string
  slug: string
  imageUrl: string | null
  startDate: string
  endDate: string | null
  isFree: boolean
  priceMin: number
  priceMax: number
  shortDesc: string | null
  bookingUrl: string | null
  sourceUrl: string | null
  venue: { name: string; arrondissement: string | null } | null
  category: { name: string; icon: string | null; slug: string } | null
}

export default function DropPage() {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<boolean | null>(null)
  const [events, setEvents] = useState<DropEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState('')
  const [isNew, setIsNew] = useState(false)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(!!data.user))
  }, [supabase])

  useEffect(() => {
    if (user === false) { setLoading(false); return }
    if (user === null) return

    fetch('/api/drop')
      .then(r => r.json())
      .then(data => {
        setEvents(data.events ?? [])
        setWeekStart(data.weekStart ?? '')
        setIsNew(data.isNew ?? false)
        setLoading(false)
        // Auto-reveal after animation for returning users
        if (!data.isNew) setRevealed(true)
      })
      .catch(() => setLoading(false))
  }, [user])

  const handleReveal = () => {
    setRevealed(true)
  }

  // Compute week dates
  const weekStartDate = weekStart ? new Date(weekStart + 'T00:00:00') : null
  const weekEndDate = weekStartDate ? new Date(weekStartDate.getTime() + 6 * 86400000) : null

  if (user === false) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/10">
          <Gift className="h-10 w-10 text-accent" />
        </div>
        <h1 className="mt-6 text-2xl font-black text-text-primary">Le Drop du lundi</h1>
        <p className="mt-2 max-w-xs text-[14px] text-text-secondary">
          Chaque semaine, 5 sorties choisies pour toi. Connecte-toi pour découvrir ton Drop.
        </p>
        <Link
          href="/login?next=/drop"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-8 py-3 text-[14px] font-bold text-white shadow-lg shadow-accent/25 hover:bg-accent-hover transition-all"
        >
          <Sparkles className="h-4 w-4" />
          Se connecter
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    )
  }

  return (
    <div className="pb-24">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-accent/10 via-bg to-neon/5 px-4 py-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,0.12),transparent_60%)]" />
        <div className="relative text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wider text-accent">
            <Flame className="h-3.5 w-3.5" />
            Drop hebdo
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-text-primary">
            Ton Drop de la semaine
          </h1>
          {weekStartDate && weekEndDate && (
            <p className="mt-2 text-[14px] text-text-secondary">
              Semaine du {weekStartDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au {weekEndDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
            </p>
          )}
          <p className="mt-1 text-[13px] text-text-muted">
            5 sorties sélectionnées rien que pour toi
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4">
        {/* Reveal animation for new drops */}
        {!revealed && isNew && events.length > 0 && (
          <div className="mt-8 text-center">
            <button
              onClick={handleReveal}
              className="group relative inline-flex items-center gap-3 rounded-2xl bg-accent px-10 py-5 text-lg font-bold text-white shadow-xl shadow-accent/30 transition-all hover:scale-105 hover:shadow-2xl active:scale-[0.98]"
            >
              <Gift className="h-6 w-6 transition-transform group-hover:rotate-12" />
              Découvrir mon Drop
              <Sparkles className="h-5 w-5 animate-pulse-soft" />
            </button>
          </div>
        )}

        {/* Events list */}
        {(revealed || !isNew) && events.length > 0 && (
          <div className="mt-6 space-y-4">
            {events.map((event, idx) => {
              const startDate = event.startDate ? new Date(event.startDate) : null
              return (
                <div
                  key={event.id}
                  className="animate-slide-up overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-sm transition-all hover:shadow-lg"
                  style={{ animationDelay: `${idx * 100}ms`, animationFillMode: 'both' }}
                >
                  <div className="flex flex-col sm:flex-row">
                    {/* Image */}
                    <Link href={`/evenements/${event.slug}`} className="relative aspect-[16/9] sm:aspect-auto sm:w-48 sm:flex-shrink-0 overflow-hidden bg-surface-hover">
                      {event.imageUrl ? (
                        <Image
                          src={event.imageUrl}
                          alt={event.title}
                          fill
                          className="object-cover transition-transform duration-500 hover:scale-105"
                          sizes="(max-width: 640px) 100vw, 200px"
                        />
                      ) : (
                        <div className="flex h-full min-h-[120px] items-center justify-center bg-gradient-to-br from-accent/5 to-neon/5">
                          <span className="text-4xl opacity-30">{event.category?.icon ?? '🎭'}</span>
                        </div>
                      )}
                      {/* Drop number badge */}
                      <div className="absolute top-3 left-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[13px] font-black text-white shadow-lg">
                          {idx + 1}
                        </span>
                      </div>
                    </Link>

                    {/* Content */}
                    <div className="flex-1 p-4">
                      {event.category && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
                          {event.category.icon} {event.category.name}
                        </span>
                      )}

                      <Link href={`/evenements/${event.slug}`}>
                        <h3 className="mt-1 text-[15px] font-bold leading-snug text-text-primary line-clamp-2 hover:text-accent transition-colors">
                          {event.title}
                        </h3>
                      </Link>

                      {event.shortDesc && (
                        <p className="mt-1 text-[12px] text-text-secondary line-clamp-2">{event.shortDesc}</p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
                        {startDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatEventDate(startDate)}
                          </span>
                        )}
                        {event.venue?.name && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {event.venue.name}
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <span className={cn(
                          'text-[13px] font-bold',
                          event.isFree ? 'text-free' : 'text-text-primary'
                        )}>
                          {formatPriceRange(event.priceMin, event.priceMax, event.isFree)}
                        </span>

                        <div className="flex-1" />

                        <div onClick={(e) => e.stopPropagation()} className="flex gap-1.5">
                          <SaveButton eventId={event.id} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface hover:border-accent/30" />
                          {(event.bookingUrl || event.sourceUrl) && (
                            <a
                              href={event.bookingUrl ?? event.sourceUrl!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex h-8 items-center gap-1 rounded-lg bg-accent px-3 text-[11px] font-bold text-white hover:bg-accent-hover transition-colors"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {event.isFree ? 'Voir' : 'Réserver'}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Empty state */}
        {events.length === 0 && (
          <div className="mt-12 text-center py-12">
            <Gift className="mx-auto h-12 w-12 text-text-muted/30" />
            <h2 className="mt-4 text-lg font-bold text-text-primary">Pas de Drop cette semaine</h2>
            <p className="mt-2 text-[14px] text-text-secondary max-w-sm mx-auto">
              Reviens lundi pour découvrir tes 5 sorties personnalisées de la semaine !
            </p>
            <Link
              href="/evenements"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-[14px] font-bold text-white hover:bg-accent-hover transition-all"
            >
              Explorer les événements
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* Teaser for more */}
        {events.length > 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-accent/20 bg-accent/5 p-5 text-center">
            <p className="text-[13px] text-text-secondary">
              <strong className="text-text-primary">Envie de plus ?</strong> Joue au Match Culturel pour découvrir encore plus de sorties.
            </p>
            <Link
              href="/match"
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-[13px] font-bold text-white hover:bg-accent-hover transition-all"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Match Culturel
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
