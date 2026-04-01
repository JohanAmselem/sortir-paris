'use client'

import { useEffect } from 'react'

export function ViewTracker({ eventId }: { eventId: string }) {
  useEffect(() => {
    // Fire-and-forget view tracking
    fetch('/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId }),
    }).catch(() => {
      // Silently ignore errors — view tracking is non-critical
    })
  }, [eventId])

  return null
}
