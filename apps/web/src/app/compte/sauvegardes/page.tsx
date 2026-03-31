'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Image from 'next/image'
import { Bookmark, Sparkles, Trash2 } from 'lucide-react'
import { cn, formatEventDate, formatPriceRange } from '@/lib/utils'
import type { User as SupabaseUser } from '@supabase/supabase-js'

interface SavedEvent {
  id: string
  title: string
  slug: string
  imageUrl: string | null
  startDate: string | null
  isFree: boolean
  priceMin: number
  priceMax: number
  venueName: string | null
  categoryName: string | null
  categoryIcon: string | null
}

export default function SauvegardesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [events, setEvents] = useState<SavedEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        try {
          const res = await fetch('/api/saves')
          if (res.ok) {
            const data = await res.json()
            setEvents(data.events ?? [])
          }
        } catch {
          // ignore
        }
      }
      setLoading(false)
    }
    load()
  }, [supabase])

  const handleUnsave = async (eventId: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== eventId))
    await fetch('/api/saves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId }),
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/10">
          <Bookmark className="h-10 w-10 text-accent" />
        </div>
        <h1 className="mt-6 text-xl font-bold text-text-primary">
          Tes favoris t&apos;attendent
        </h1>
        <p className="mt-2 max-w-xs text-sm text-text-secondary">
          Connecte-toi pour sauvegarder tes événements préférés et ne rien rater.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent/90 transition-all"
        >
          <Sparkles className="h-4 w-4" />
          Se connecter
        </Link>
      </div>
    )
  }

  return (
    <div className="px-4 py-8">
      <h1 className="text-2xl font-bold text-text-primary">Mes favoris</h1>
      <p className="mt-1 text-sm text-text-muted">
        {events.length} événement{events.length !== 1 ? 's' : ''} sauvegardé{events.length !== 1 ? 's' : ''}
      </p>

      {events.length > 0 ? (
        <div className="mt-6 space-y-3">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex gap-4 rounded-xl border border-border bg-surface p-3 transition-all hover:shadow-md"
            >
              <Link href={`/evenements/${event.slug}`} className="flex-shrink-0">
                <div className="relative h-20 w-20 overflow-hidden rounded-lg bg-surface-hover">
                  {event.imageUrl ? (
                    <Image
                      src={event.imageUrl}
                      alt={event.title}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-2xl">
                      {event.categoryIcon ?? '🎭'}
                    </div>
                  )}
                </div>
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/evenements/${event.slug}`}>
                  <h3 className="line-clamp-1 text-sm font-semibold text-text-primary hover:text-accent transition-colors">
                    {event.title}
                  </h3>
                </Link>
                <p className="mt-0.5 text-xs text-text-muted">
                  {event.startDate ? formatEventDate(new Date(event.startDate)) : ''}
                  {event.venueName ? ` · ${event.venueName}` : ''}
                </p>
                <p className={cn(
                  'mt-1 text-xs font-semibold',
                  event.isFree ? 'text-free' : 'text-text-primary'
                )}>
                  {formatPriceRange(event.priceMin, event.priceMax, event.isFree)}
                </p>
              </div>
              <button
                onClick={() => handleUnsave(event.id)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-red-50 hover:text-red-500 transition-colors self-center"
                title="Retirer des favoris"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-16 text-center">
          <p className="text-5xl">💜</p>
          <p className="mt-4 text-lg font-semibold text-text-primary">
            Aucun favori pour le moment
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Explore les événements et clique sur le signet pour sauvegarder.
          </p>
          <Link
            href="/evenements"
            className="mt-6 inline-block rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent/90 transition-all"
          >
            Explorer
          </Link>
        </div>
      )}
    </div>
  )
}
