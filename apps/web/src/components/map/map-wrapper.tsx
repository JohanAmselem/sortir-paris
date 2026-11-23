'use client'

import dynamic from 'next/dynamic'
import type { EventMapProps } from './event-map'

// mapbox-gl needs the browser: load it client-side only, after the page shell.
const EventMap = dynamic(() => import('./event-map').then((m) => m.EventMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-surface" role="status">
      <p className="t-body text-text-secondary">Chargement de la carte…</p>
    </div>
  ),
})

export function MapWrapper(props: EventMapProps) {
  return <EventMap {...props} />
}
