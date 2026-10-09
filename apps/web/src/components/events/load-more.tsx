'use client'

import { useEffect, useRef, useState } from 'react'
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

const PAGE = 24

export function LoadMore({ params, initialCount, total, nowIso, layout = 'grid', seenIds = [] }: LoadMoreProps) {
  const [items, setItems] = useState<CardEvent[]>([])
  const [offset, setOffset] = useState(initialCount)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [done, setDone] = useState(initialCount >= total)
  const now = new Date(nowIso)
  // Mirrors of the state for the sequential restore below.
  const offsetRef = useRef(initialCount)
  const itemsRef = useRef<CardEvent[]>([])

  /** Loads one page; returns false when there is nothing more. */
  const fetchPage = async (): Promise<boolean> => {
    const sp = new URLSearchParams(params)
    sp.set('offset', String(offsetRef.current))
    sp.set('limit', String(PAGE))
    const res = await fetch(`/api/events?${sp}`)
    if (!res.ok) throw new Error(String(res.status))
    const page = (await res.json()) as EventPage
    const seen = new Set([...seenIds, ...itemsRef.current.map((e) => e.id)])
    itemsRef.current = [...itemsRef.current, ...page.events.filter((e) => !seen.has(e.id))]
    offsetRef.current += page.events.length
    setItems(itemsRef.current)
    setOffset(offsetRef.current)
    const more = page.hasMore && page.events.length > 0
    if (!more) setDone(true)
    return more
  }

  /** "?page=3" in the address bar: the back button brings the same list back. */
  const savePage = (n: number) => {
    try {
      const url = new URL(window.location.href)
      if (n > 1) url.searchParams.set('page', String(n))
      else url.searchParams.delete('page')
      window.history.replaceState(window.history.state, '', url)
    } catch {
      // Not critical.
    }
  }

  const load = async (pages = 1) => {
    setLoading(true)
    setError(false)
    try {
      for (let i = 0; i < pages; i++) {
        const more = await fetchPage()
        if (!more) break
      }
      savePage(1 + Math.ceil((offsetRef.current - initialCount) / PAGE))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  // Restore the pages already loaded before a reload / back navigation.
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get('page'))
    if (Number.isInteger(n) && n > 1 && initialCount < total) void load(Math.min(n - 1, 10))
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          <div className="grid grid-cols-1 divide-y divide-border border-t border-border sm:mt-8 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-8 sm:divide-y-0 sm:border-t-0 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((e) => (
              <EventCard key={e.id} event={e} variant="compact" now={now} />
            ))}
          </div>
        ))}
      <div className="mt-8 flex flex-col items-center gap-2" aria-live="polite">
        {error && <p className="text-[14px] text-text-secondary">Le chargement a échoué.</p>}
        {!done && (
          <button
            type="button"
            onClick={() => load()}
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
