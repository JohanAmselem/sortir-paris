'use client'

import dynamic from 'next/dynamic'
import type { MapEvent } from './event-map'

// Load map client-side only (mapbox-gl requires browser APIs)
const EventMap = dynamic(
  () => import('./event-map').then((mod) => mod.EventMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center rounded-2xl bg-surface-hover">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm text-text-muted">Chargement de la carte...</p>
        </div>
      </div>
    ),
  }
)

export function MapWrapper({ events }: { events: MapEvent[] }) {
  return <EventMap events={events} />
}
