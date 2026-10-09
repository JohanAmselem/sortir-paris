'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

export interface NearbyPin {
  /** Venue slug (one pin per venue). */
  key: string
  name: string
  lat: number
  lng: number
  /** Number shown on the pin, matching the list. */
  label: number
}

export interface NearbyMapProps {
  center: { lat: number; lng: number }
  radiusKm: number
  pins: NearbyPin[]
}

/** Small, static-feeling map for /autour-de-moi: the user's dot + numbered venue pins. */
export function NearbyMap({ center, radiusKm, pins }: NearbyMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markers = useRef<mapboxgl.Marker[]>([])
  const [error, setError] = useState<string | null>(TOKEN ? null : 'La carte n’est pas configurée.')

  useEffect(() => {
    if (!TOKEN || !container.current || map.current) return
    mapboxgl.accessToken = TOKEN
    try {
      map.current = new mapboxgl.Map({
        container: container.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [center.lng, center.lat],
        zoom: 14,
        attributionControl: false,
        cooperativeGestures: true,
      })
    } catch {
      setError('Ton navigateur ne peut pas afficher la carte.')
      return
    }
    map.current.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
    return () => {
      map.current?.remove()
      map.current = null
    }
    // The map is created once; center/pins changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m) return
    for (const mk of markers.current) mk.remove()
    markers.current = []

    const me = document.createElement('div')
    me.className = 'h-4 w-4 rounded-full border-[3px] border-white bg-[#2563eb] shadow-[0_0_0_6px_rgba(37,99,235,0.2)]'
    me.setAttribute('aria-hidden', 'true')
    markers.current.push(new mapboxgl.Marker({ element: me }).setLngLat([center.lng, center.lat]).addTo(m))

    const bounds = new mapboxgl.LngLatBounds([center.lng, center.lat], [center.lng, center.lat])
    for (const p of pins) {
      const el = document.createElement('div')
      el.className = 'flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#7c3aed] text-[11px] font-bold text-white shadow'
      el.textContent = String(p.label)
      el.title = p.name
      el.setAttribute('aria-hidden', 'true')
      markers.current.push(new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m))
      bounds.extend([p.lng, p.lat])
    }
    if (pins.length) m.fitBounds(bounds, { padding: 36, maxZoom: 15.5, duration: 0 })
    else m.jumpTo({ center: [center.lng, center.lat], zoom: radiusKm <= 1 ? 14.5 : radiusKm <= 2 ? 13.5 : 12.5 })
  }, [center.lat, center.lng, radiusKm, pins])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-paper-deep p-4 text-center text-[14px] text-text-secondary" role="status">
        {error}
      </div>
    )
  }
  return <div ref={container} className="h-full w-full" />
}
