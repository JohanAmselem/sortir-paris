'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Heart, X, MapPin, Calendar, Sparkles, Loader2, ArrowRight, Zap, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatEventDate, formatPriceRange, cn } from '@/lib/utils'

interface MatchEvent {
  id: string
  title: string
  slug: string
  imageUrl: string | null
  startDate: string
  isFree: boolean
  priceMin: number
  priceMax: number
  shortDesc: string | null
  venue: { name: string; arrondissement: string | null } | null
  category: { name: string; icon: string | null; slug: string } | null
}

export function MatchGame() {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<boolean | null>(null)
  const [events, setEvents] = useState<MatchEvent[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [swipesToday, setSwipesToday] = useState(0)
  const [remaining, setRemaining] = useState(15)
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const startPos = useRef({ x: 0, y: 0 })
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(!!data.user))
  }, [supabase])

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/swipe')
      if (res.status === 401) { setUser(false); return }
      const data = await res.json()
      setEvents(data.events ?? [])
      setSwipesToday(data.swipesToday ?? 0)
      setRemaining(data.remaining ?? 15)
      setCurrentIndex(0)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (user) fetchEvents()
    else if (user === false) setLoading(false)
  }, [user, fetchEvents])

  const handleSwipe = async (direction: 'left' | 'right') => {
    if (remaining <= 0) return
    const event = events[currentIndex]
    if (!event) return

    setSwipeDirection(direction)

    // Animate out
    await new Promise(r => setTimeout(r, 300))

    await fetch('/api/swipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: event.id, direction }),
    })

    setSwipesToday(prev => prev + 1)
    setRemaining(prev => Math.max(0, prev - 1))
    setSwipeDirection(null)
    setOffset({ x: 0, y: 0 })

    if (currentIndex + 1 < events.length) {
      setCurrentIndex(prev => prev + 1)
    } else {
      // Fetch more
      fetchEvents()
    }
  }

  // Touch / drag handling
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true)
    startPos.current = { x: e.clientX, y: e.clientY }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return
    const dx = e.clientX - startPos.current.x
    const dy = (e.clientY - startPos.current.y) * 0.3
    setOffset({ x: dx, y: dy })
  }

  const handlePointerUp = () => {
    if (!isDragging) return
    setIsDragging(false)

    if (offset.x > 80) {
      handleSwipe('right')
    } else if (offset.x < -80) {
      handleSwipe('left')
    } else {
      setOffset({ x: 0, y: 0 })
    }
  }

  const currentEvent = events[currentIndex]
  const rotation = offset.x * 0.1
  const opacity = Math.max(0, 1 - Math.abs(offset.x) / 400)

  // Not logged in
  if (user === false) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/10">
          <Heart className="h-10 w-10 text-accent" />
        </div>
        <h1 className="mt-6 text-2xl font-black text-text-primary">Match Culturel</h1>
        <p className="mt-2 max-w-xs text-[14px] text-text-secondary">
          Connecte-toi pour découvrir des événements qui te correspondent
        </p>
        <Link
          href="/login?next=/match"
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

  // No more events or daily limit
  if (remaining <= 0 || (!currentEvent && events.length > 0)) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/10">
          <Lock className="h-10 w-10 text-amber-500" />
        </div>
        <h2 className="mt-6 text-xl font-bold text-text-primary">
          {remaining <= 0 ? 'Limite quotidienne atteinte !' : 'Tu as tout vu !'}
        </h2>
        <p className="mt-2 max-w-xs text-[14px] text-text-secondary">
          {remaining <= 0
            ? `Tu as swipé ${swipesToday} événements aujourd'hui. Reviens demain pour de nouvelles découvertes !`
            : 'Plus d\'événements à swiper pour le moment.'}
        </p>
        <div className="mt-4 text-[13px] text-text-muted">
          <Zap className="inline h-3.5 w-3.5 text-accent" /> +{swipesToday * 2} XP gagnés
        </div>
        <Link
          href="/evenements"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-[14px] font-bold text-white hover:bg-accent-hover transition-all"
        >
          Explorer les événements
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    )
  }

  // No events at all
  if (!currentEvent) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-5xl">🎲</p>
        <h2 className="mt-4 text-xl font-bold text-text-primary">Pas d&apos;événements</h2>
        <p className="mt-2 text-[14px] text-text-secondary">Aucun événement disponible pour le moment</p>
      </div>
    )
  }

  const startDate = currentEvent.startDate ? new Date(currentEvent.startDate) : null

  return (
    <div className="flex min-h-[80vh] flex-col items-center px-4 py-6">
      {/* Header */}
      <div className="w-full max-w-sm text-center">
        <h1 className="flex items-center justify-center gap-2 text-xl font-black text-text-primary">
          <Heart className="h-5 w-5 text-accent" />
          Match Culturel
        </h1>
        <p className="mt-1 text-[12px] text-text-muted">
          {remaining} swipe{remaining > 1 ? 's' : ''} restant{remaining > 1 ? 's' : ''} aujourd&apos;hui
        </p>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 w-full rounded-full bg-surface-hover overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: `${((15 - remaining) / 15) * 100}%` }}
          />
        </div>
      </div>

      {/* Card */}
      <div className="relative mt-6 w-full max-w-sm" style={{ minHeight: 480 }}>
        {/* Swipe indicators */}
        <div
          className="pointer-events-none absolute top-6 left-6 z-20 rounded-xl border-4 border-free bg-free/10 px-4 py-2 font-black text-free text-xl -rotate-12 transition-opacity duration-150"
          style={{ opacity: offset.x > 40 || swipeDirection === 'right' ? Math.min(1, offset.x / 100) : 0 }}
        >
          LIKE ❤️
        </div>
        <div
          className="pointer-events-none absolute top-6 right-6 z-20 rounded-xl border-4 border-red-500 bg-red-500/10 px-4 py-2 font-black text-red-500 text-xl rotate-12 transition-opacity duration-150"
          style={{ opacity: offset.x < -40 || swipeDirection === 'left' ? Math.min(1, Math.abs(offset.x) / 100) : 0 }}
        >
          NOPE 👋
        </div>

        <div
          ref={cardRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className={cn(
            'relative w-full cursor-grab overflow-hidden rounded-3xl border border-border/60 bg-surface shadow-xl select-none touch-none',
            isDragging && 'cursor-grabbing',
            swipeDirection === 'right' && 'animate-swipe-right',
            swipeDirection === 'left' && 'animate-swipe-left',
          )}
          style={{
            transform: swipeDirection
              ? undefined
              : `translateX(${offset.x}px) translateY(${offset.y}px) rotate(${rotation}deg)`,
            opacity: swipeDirection ? undefined : opacity,
            transition: isDragging ? 'none' : 'transform 0.3s ease, opacity 0.3s ease',
          }}
        >
          {/* Image */}
          <div className="relative aspect-[3/4] w-full overflow-hidden">
            {currentEvent.imageUrl ? (
              <Image
                src={currentEvent.imageUrl}
                alt={currentEvent.title}
                fill
                className="object-cover"
                sizes="400px"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-br from-accent/10 to-neon/10">
                <span className="text-8xl opacity-30">{currentEvent.category?.icon ?? '🎭'}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

            {/* Content overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-5">
              {/* Category */}
              {currentEvent.category && (
                <span className="inline-block rounded-lg bg-accent/90 px-2.5 py-1 text-[10px] font-bold text-white uppercase tracking-wider backdrop-blur-sm">
                  {currentEvent.category.icon} {currentEvent.category.name}
                </span>
              )}

              <h2 className="mt-2 text-xl font-bold text-white leading-tight line-clamp-2">
                {currentEvent.title}
              </h2>

              {currentEvent.shortDesc && (
                <p className="mt-1.5 text-[13px] text-white/70 line-clamp-2 leading-relaxed">
                  {currentEvent.shortDesc}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-white/60">
                {startDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatEventDate(startDate)}
                  </span>
                )}
                {currentEvent.venue?.name && (
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="h-3 w-3" />
                    {currentEvent.venue.name}
                  </span>
                )}
              </div>

              <div className="mt-2">
                <span className={cn(
                  'text-[14px] font-bold',
                  currentEvent.isFree ? 'text-free' : 'text-white'
                )}>
                  {formatPriceRange(currentEvent.priceMin, currentEvent.priceMax, currentEvent.isFree)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Voir plus link */}
        <div className="mt-2 text-center">
          <Link
            href={`/evenements/${currentEvent.slug}`}
            className="text-[12px] font-medium text-text-muted hover:text-accent transition-colors"
          >
            Voir les détails →
          </Link>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-6 flex items-center gap-6">
        <button
          onClick={() => handleSwipe('left')}
          className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-200 bg-white text-red-500 shadow-lg transition-all hover:scale-110 hover:shadow-xl hover:border-red-300 active:scale-95"
        >
          <X className="h-7 w-7" strokeWidth={3} />
        </button>
        <button
          onClick={() => handleSwipe('right')}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-white shadow-xl shadow-accent/30 transition-all hover:scale-110 hover:shadow-2xl active:scale-95"
        >
          <Heart className="h-9 w-9" fill="white" strokeWidth={0} />
        </button>
      </div>
    </div>
  )
}
