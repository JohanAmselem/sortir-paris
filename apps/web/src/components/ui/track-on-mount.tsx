'use client'

import { useEffect } from 'react'
import { track, type AnalyticsEvent } from '@/lib/analytics'

/** Sends one analytics event when a (server-rendered) page or block is shown. */
export function TrackOnMount({ event, props }: { event: AnalyticsEvent; props?: Record<string, string | number | boolean> }) {
  const key = JSON.stringify(props ?? {})
  useEffect(() => {
    track(event, JSON.parse(key) as Record<string, string | number | boolean>)
  }, [event, key])
  return null
}
