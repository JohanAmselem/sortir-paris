'use client'

import { useEffect } from 'react'
import { track } from '@/lib/analytics'

/** Counts a view (deduplicated server-side) and records the funnel step. */
export function ViewTracker({ eventId }: { eventId: string }) {
  useEffect(() => {
    track('event_open', { event: eventId, from: document.referrer.includes(location.host) ? 'internal' : 'external' })
    fetch('/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId }),
      keepalive: true,
    }).catch(() => {})
  }, [eventId])
  return null
}
