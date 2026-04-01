'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MapPin, Navigation, X } from 'lucide-react'
import Link from 'next/link'
import { formatEventDate } from '@/lib/utils'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

// Category → color mapping
const CATEGORY_COLORS: Record<string, string> = {
  concert: '#7C3AED',
  expo: '#F43F5E',
  theatre: '#EF4444',
  cinema: '#F59E0B',
  festival: '#10B981',
  conference: '#6366F1',
  danse: '#EC4899',
  spectacle: '#F97316',
  atelier: '#14B8A6',
  visite: '#8B5CF6',
  sport: '#22C55E',
}

export interface MapEvent {
  id: string
  title: string
  slug: string
  imageUrl: string | null
  startDate: string | null
  isFree: boolean
  categorySlug: string | null
  categoryName: string | null
  categoryIcon: string | null
  venueName: string | null
  lat: number
  lng: number
}

interface EventMapProps {
  events: MapEvent[]
}

export function EventMap({ events }: EventMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<MapEvent | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const markersRef = useRef<mapboxgl.Marker[]>([])

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
  }, [])

  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_TOKEN) return

    mapboxgl.accessToken = MAPBOX_TOKEN

    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [2.3522, 48.8566], // Paris center
      zoom: 12,
      minZoom: 10,
      maxZoom: 18,
    })

    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

    map.current = m

    return () => {
      clearMarkers()
      m.remove()
    }
  }, [clearMarkers])

  // Add markers when events change
  useEffect(() => {
    if (!map.current) return

    clearMarkers()

    events.forEach((event) => {
      const color = CATEGORY_COLORS[event.categorySlug || ''] || '#7C3AED'

      // Create custom marker element
      const el = document.createElement('div')
      el.className = 'map-marker'
      el.style.cssText = `
        width: 28px; height: 28px; border-radius: 50%;
        background: ${color}; border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: pointer; transition: transform 0.15s;
        display: flex; align-items: center; justify-content: center;
        font-size: 12px;
      `
      el.innerHTML = event.categoryIcon || '📍'
      el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.3)' })
      el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)' })
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        setSelectedEvent(event)
        map.current?.flyTo({ center: [event.lng, event.lat], zoom: 15, duration: 500 })
      })

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([event.lng, event.lat])
        .addTo(map.current!)

      markersRef.current.push(marker)
    })
  }, [events, clearMarkers])

  // Close popup when clicking on map
  useEffect(() => {
    if (!map.current) return
    const m = map.current
    const handler = () => setSelectedEvent(null)
    m.on('click', handler)
    return () => { m.off('click', handler) }
  }, [])

  const handleLocateMe = () => {
    if (!navigator.geolocation || !map.current) return
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.current?.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 14,
          duration: 1000,
        })
        setIsLocating(false)
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-[60vh] items-center justify-center rounded-2xl bg-surface-hover">
        <p className="text-text-muted">Carte indisponible (token Mapbox manquant)</p>
      </div>
    )
  }

  return (
    <div className="relative h-[calc(100vh-8rem)] w-full overflow-hidden rounded-2xl md:h-[calc(100vh-5rem)]">
      <div ref={mapContainer} className="h-full w-full" />

      {/* Locate me button */}
      <button
        onClick={handleLocateMe}
        disabled={isLocating}
        className="absolute bottom-4 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-lg border border-border/60 hover:bg-surface-hover transition-colors disabled:opacity-50"
        title="Ma position"
      >
        <Navigation className={`h-5 w-5 text-accent ${isLocating ? 'animate-pulse' : ''}`} />
      </button>

      {/* Event count badge */}
      <div className="absolute top-4 left-4 z-10 rounded-lg bg-white/90 backdrop-blur-sm px-3 py-1.5 shadow-sm border border-border/40">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-accent" />
          <span className="text-[12px] font-semibold text-text-primary">
            {events.length} événement{events.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Selected event card */}
      {selectedEvent && (
        <div className="absolute bottom-4 left-4 right-16 z-10 animate-slide-up">
          <div className="rounded-2xl bg-white shadow-xl border border-border/40 overflow-hidden">
            <button
              onClick={() => setSelectedEvent(null)}
              className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <Link href={`/evenements/${selectedEvent.slug}`} className="flex gap-3 p-3">
              {selectedEvent.imageUrl ? (
                <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-surface-hover">
                  <img
                    src={selectedEvent.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-surface-hover">
                  <span className="text-2xl">{selectedEvent.categoryIcon || '🎭'}</span>
                </div>
              )}

              <div className="min-w-0 flex-1">
                {selectedEvent.categoryName && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
                    {selectedEvent.categoryIcon} {selectedEvent.categoryName}
                  </span>
                )}
                <h3 className="mt-0.5 truncate text-[14px] font-bold text-text-primary">
                  {selectedEvent.title}
                </h3>
                {selectedEvent.venueName && (
                  <p className="mt-0.5 flex items-center gap-1 text-[12px] text-text-muted">
                    <MapPin className="h-3 w-3" />
                    {selectedEvent.venueName}
                  </p>
                )}
                {selectedEvent.startDate && (
                  <p className="mt-0.5 text-[12px] text-text-secondary">
                    {formatEventDate(new Date(selectedEvent.startDate))}
                  </p>
                )}
                {selectedEvent.isFree && (
                  <span className="mt-1 inline-block rounded bg-free/10 px-1.5 py-0.5 text-[10px] font-bold text-free">
                    Gratuit
                  </span>
                )}
              </div>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
