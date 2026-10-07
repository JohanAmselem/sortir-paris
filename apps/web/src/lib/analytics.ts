'use client'
/**
 * Minimal product analytics. No personal data: event names + a few coarse
 * properties. Sent to Plausible when configured (NEXT_PUBLIC_PLAUSIBLE_DOMAIN)
 * and to Vercel Analytics custom events.
 *
 * Funnel: page view → discovery (search / intent / filter / map / surprise)
 *         → event_open → outbound_click
 */
import { track as vercelTrack } from '@vercel/analytics'

export type AnalyticsEvent =
  | 'search'
  | 'intent_chip'
  | 'filter'
  | 'event_open'
  | 'outbound_click'
  | 'map_open'
  | 'map_select'
  | 'map_locate'
  | 'surprise'
  | 'save'
  | 'newsletter_signup'
  | 'collection_open'
  | 'match_swipe'
  | 'ai_search'
  | 'quiz_complete'

type Props = Record<string, string | number | boolean | null | undefined>

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, string | number | boolean> }) => void
  }
}

export function track(event: AnalyticsEvent, props: Props = {}) {
  if (typeof window === 'undefined') return
  const clean: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(props)) if (v != null) clean[k] = v
  try {
    window.plausible?.(event, { props: clean })
  } catch {}
  try {
    vercelTrack(event, clean)
  } catch {}
}
