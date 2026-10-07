'use client'

import { useEffect, useMemo, useState } from 'react'
import { EventCard } from '@/components/events/event-card'
import type { CardEvent } from '@/lib/events/types'
import { localSignals } from '@/app/club/_lib/local'

/**
 * Anonymous drop: server renders the generic picks; when this device has a
 * quiz result or swipes, ask for picks personalised with them (not stored).
 */
export function LocalDrop({ initial, nowIso }: { initial: CardEvent[]; nowIso: string }) {
  const [events, setEvents] = useState(initial)
  const [personal, setPersonal] = useState(false)
  const now = useMemo(() => new Date(nowIso), [nowIso])

  useEffect(() => {
    const signals = localSignals()
    if (!signals) return
    const ctrl = new AbortController()
    fetch('/api/drop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signals }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { events?: CardEvent[]; personalized?: boolean } | null) => {
        if (d?.events?.length) {
          setEvents(d.events)
          setPersonal(Boolean(d.personalized))
        }
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [])

  const [first, ...rest] = events
  if (!first) return null
  return (
    <section aria-label="La sélection" className="mt-8" aria-live="polite">
      {personal && (
        <p className="mb-4 inline-flex rounded-full bg-accent-soft px-3 py-1.5 text-[13px] font-semibold text-accent">
          Personnalisé avec ce que tu as joué sur cet appareil
        </p>
      )}
      <EventCard event={first} variant="feature" rank={1} priority now={now} />
      {rest.length > 0 && (
        <div className="mt-8 grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {rest.map((e) => (
            <EventCard key={e.id} event={e} now={now} />
          ))}
        </div>
      )}
    </section>
  )
}
