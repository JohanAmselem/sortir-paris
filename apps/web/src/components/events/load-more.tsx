'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { EventCard } from './event-card'
import type { CardEvent, EventPage } from '@/lib/events/types'
import { cn } from '@/lib/utils'

interface LoadMoreProps {
  /** Query string (without offset/limit) for /api/events. */
  params: string
  /** Number of items already rendered by the server. */
  initialCount: number
  total: number
  nowIso: string
  layout?: 'grid' | 'list'
  /** Ids already on the page, to never render duplicates. */
  seenIds?: string[]
}

export function LoadMore({ params, initialCount, total, nowIso, layout = 'grid', seenIds = [] }: LoadMoreProps) {
  const [items, setItems] = useState<CardEvent[]>([])
  const [offset, setOffset] = useState(initialCount)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [done, setDone] = useState(initialCount >= total)
  const now = new Date(nowIso)

  const load = async () => {
    setLoading(true)
    setError(false)
    try {
      const sp = new URLSearchParams(params)
      sp.set('offset', String(offset))
      sp.set('limit', '24')
      const res = await fetch(`/api/events?${sp}`)
      if (!res.ok) throw new Error(String(res.status))
      const page = (await res.json()) as EventPage
      const seen = new Set([...seenIds, ...items.map((e) => e.id)])
      setItems((prev) => [...prev, ...page.events.filter((e) => !seen.has(e.id))])
      setOffset((o) => o + page.events.length)
      if (!page.hasMore || page.events.length === 0) setDone(true)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {items.length > 0 &&
        (layout === 'list' ? (
          <div className="divide-y divide-border border-t border-border">
            {items.map((e) => (
              <EventCard key={e.id} event={e} variant="row" now={now} />
            ))}
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((e) => (
              <EventCard key={e.id} event={e} now={now} />
            ))}
          </div>
        ))}
      <div className="mt-8 flex flex-col items-center gap-2" aria-live="polite">
        {error && <p className="text-[14px] text-text-secondary">Le chargement a échoué.</p>}
        {!done && (
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className={cn(
              'inline-flex h-12 items-center gap-2 rounded-full border border-ink px-6 text-[15px] font-semibold text-ink transition-colors hover:bg-ink hover:text-paper disabled:opacity-60'
            )}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {error ? 'Réessayer' : `Voir plus (${Math.max(total - offset, 0).toLocaleString('fr-FR')} restants)`}
          </button>
        )}
      </div>
    </>
  )
}
