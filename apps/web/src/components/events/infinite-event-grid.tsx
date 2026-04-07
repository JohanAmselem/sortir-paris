'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EventCard } from './event-card'
import type { EventWithRelations } from '@sortir/shared'

interface APIEvent {
  event: Record<string, unknown>
  venue: Record<string, unknown> | null
  category: Record<string, unknown> | null
}

function toEventWithRelations(item: APIEvent): EventWithRelations {
  return {
    ...item.event,
    category: item.category,
    venue: item.venue,
    tags: [],
    ambiances: [],
  } as unknown as EventWithRelations
}

interface InfiniteEventGridProps {
  /** Initial events loaded server-side */
  initialEvents: EventWithRelations[]
  /** Query params to pass to the API for pagination */
  apiParams?: Record<string, string>
  /** Sort order for the API */
  sort?: string
  /** Grid columns class override */
  gridClassName?: string
}

export function InfiniteEventGrid({
  initialEvents,
  apiParams = {},
  sort = 'quality',
  gridClassName = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
}: InfiniteEventGridProps) {
  const [events, setEvents] = useState<EventWithRelations[]>(initialEvents)
  const [page, setPage] = useState(2) // Page 1 is the initial server-rendered data
  const [hasMore, setHasMore] = useState(initialEvents.length >= 48)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Stabilize apiParams to prevent infinite re-renders from object reference changes
  const stableApiParams = useMemo(
    () => JSON.stringify(apiParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(apiParams)]
  )

  // Reset when initialEvents change (e.g. filters change)
  useEffect(() => {
    setEvents(initialEvents)
    setPage(2)
    setHasMore(initialEvents.length >= 48)
  }, [initialEvents])

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)

    const params = new URLSearchParams({
      page: String(page),
      limit: '24',
      sort,
      ...JSON.parse(stableApiParams) as Record<string, string>,
    })

    try {
      const res = await fetch(`/api/events?${params}`)
      const json = await res.json()

      const newEvents = (json.data as APIEvent[]).map(toEventWithRelations)
      setEvents((prev) => [...prev, ...newEvents])
      setHasMore(json.hasMore)
      setPage((p) => p + 1)
    } catch {
      // Silently fail — user can scroll back up
    } finally {
      setLoading(false)
    }
  }, [loading, hasMore, page, sort, stableApiParams])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore()
        }
      },
      { rootMargin: '400px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore])

  return (
    <>
      <div className={gridClassName}>
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>

      {/* Sentinel for intersection observer */}
      <div ref={sentinelRef} className="h-px" />

      {loading && (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      )}

      {!hasMore && events.length > 48 && (
        <p className="py-8 text-center text-[13px] text-text-muted">
          Tous les événements ont été chargés
        </p>
      )}
    </>
  )
}
