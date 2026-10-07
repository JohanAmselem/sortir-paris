'use client'

import { useEffect, useState } from 'react'
import { EventRail, SectionHeader } from '@/components/events/blocks'
import type { CardEvent } from '@/lib/events/types'

/** Personal picks, fetched after load so the homepage stays static for everyone. */
export function PourToiClient({ excludeIds }: { excludeIds: string[] }) {
  const [events, setEvents] = useState<CardEvent[] | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetch('/api/me/picks', { signal: ac.signal, credentials: 'same-origin' })
      .then((r) => (r.status === 200 ? r.json() : null))
      .then((d: { events: CardEvent[] } | null) => setEvents(d ? d.events.filter((e) => !excludeIds.includes(e.id)) : []))
      .catch(() => setEvents([]))
    return () => ac.abort()
  }, [excludeIds])

  if (!events || events.length < 3) return null
  return (
    <section aria-labelledby="pour-toi-title" className="px-4 pt-14">
      <SectionHeader id="pour-toi-title" kicker="Choisi pour toi" title="Pour toi cette semaine" href="/drop" linkLabel="Ton drop" />
      <EventRail events={events} now={new Date()} className="mt-5" />
    </section>
  )
}
