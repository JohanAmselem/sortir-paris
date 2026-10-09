'use client'

import dynamic from 'next/dynamic'
import type { NearbyMapProps } from './nearby-map'

// mapbox-gl is only downloaded on /autour-de-moi, once a position is known.
const NearbyMap = dynamic(() => import('./nearby-map').then((m) => m.NearbyMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-paper-deep" role="status">
      <p className="text-[14px] text-text-secondary">Chargement de la carte…</p>
    </div>
  ),
})

export function NearbyMapWrapper(props: NearbyMapProps) {
  return <NearbyMap {...props} />
}
