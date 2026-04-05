'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MapPin, Navigation, X, Filter } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { formatEventDate } from '@/lib/utils'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

// Category → color mapping (DB slugs — mix of singular/plural)
const CATEGORY_COLORS: Record<string, string> = {
  concerts: '#7C3AED', concert: '#7C3AED',
  expos: '#F43F5E', expo: '#F43F5E',
  theatre: '#EF4444',
  cinema: '#F59E0B',
  festivals: '#10B981', festival: '#10B981',
  conferences: '#6366F1', conference: '#6366F1',
  danse: '#EC4899',
  spectacles: '#F97316', spectacle: '#F97316',
  ateliers: '#14B8A6', atelier: '#14B8A6',
  visites: '#8B5CF6', visite: '#8B5CF6',
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

const DATE_FILTERS = [
  { id: 'all', label: 'Tout' },
  { id: 'today', label: 'Ce soir' },
  { id: 'weekend', label: 'Week-end' },
  { id: 'week', label: 'Semaine' },
] as const

const CATEGORY_FILTERS = [
  { slug: 'concerts', icon: '🎵', label: 'Concerts' },
  { slug: 'expos', icon: '🎨', label: 'Expos' },
  { slug: 'theatre', icon: '🎭', label: 'Théâtre' },
  { slug: 'cinema', icon: '🎬', label: 'Cinéma' },
  { slug: 'festivals', icon: '🎪', label: 'Festivals' },
  { slug: 'danse', icon: '💃', label: 'Danse' },
  { slug: 'spectacles', icon: '🎪', label: 'Spectacles' },
  { slug: 'ateliers', icon: '🛠️', label: 'Ateliers' },
] as const

function isToday(d: Date) {
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

function isThisWeekend(d: Date) {
  const now = new Date()
  const day = now.getDay()
  const sat = new Date(now); sat.setDate(now.getDate() + (6 - day)); sat.setHours(0, 0, 0, 0)
  const sun = new Date(sat); sun.setDate(sat.getDate() + 1); sun.setHours(23, 59, 59, 999)
  return d >= sat && d <= sun
}

function isThisWeek(d: Date) {
  const now = new Date()
  const end = new Date(now); end.setDate(now.getDate() + 7)
  return d >= now && d <= end
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Create DOM marker element ───
function createMarkerEl(event: MapEvent): HTMLDivElement {
  const color = CATEGORY_COLORS[event.categorySlug || ''] || '#7C3AED'
  const icon = event.categoryIcon || '📍'

  const el = document.createElement('div')
  el.className = 'map-marker-wrapper'
  el.style.cssText = `
    width: 36px; height: 36px; position: relative;
    cursor: pointer; z-index: 1;
  `

  const dot = document.createElement('div')
  dot.className = 'map-marker-dot'
  dot.style.cssText = `
    width: 36px; height: 36px; border-radius: 50%;
    background: ${color}; border: 3px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; line-height: 1;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    pointer-events: none;
  `
  dot.textContent = icon

  el.appendChild(dot)

  // Hover — scale up the inner dot (no flicker since events are on the wrapper)
  el.addEventListener('mouseenter', () => {
    dot.style.transform = 'scale(1.35)'
    dot.style.boxShadow = '0 4px 14px rgba(0,0,0,0.35)'
    el.style.zIndex = '10'
  })
  el.addEventListener('mouseleave', () => {
    dot.style.transform = 'scale(1)'
    dot.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)'
    el.style.zIndex = '1'
  })

  return el
}

// ─── Create cluster marker ───
function createClusterEl(count: number): HTMLDivElement {
  const el = document.createElement('div')
  const size = count < 10 ? 40 : count < 30 ? 48 : 56
  const color = count < 10 ? '#7C3AED' : count < 30 ? '#E94560' : '#F59E0B'

  el.style.cssText = `
    width: ${size}px; height: ${size}px; border-radius: 50%;
    background: ${color}; border: 3px solid white;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    display: flex; align-items: center; justify-content: center;
    color: white; font-weight: 700; font-size: ${count < 10 ? 14 : 15}px;
    cursor: pointer; transition: transform 0.15s ease;
    font-family: system-ui, -apple-system, sans-serif;
  `
  el.textContent = count >= 1000 ? `${Math.round(count / 100) / 10}k` : String(count)

  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.15)' })
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)' })

  return el
}

// ─── Tooltip on hover ───
function createTooltip(event: MapEvent): HTMLDivElement {
  const tip = document.createElement('div')
  tip.style.cssText = `
    position: absolute; bottom: calc(100% + 8px); left: 50%;
    transform: translateX(-50%); white-space: nowrap;
    background: white; border-radius: 10px; padding: 6px 10px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    border: 1px solid rgba(0,0,0,0.06);
    pointer-events: none; z-index: 100;
    font-family: system-ui, -apple-system, sans-serif;
    max-width: 220px;
  `
  tip.innerHTML = `
    <div style="font-size:12px;font-weight:700;color:#1a1a2e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px">${event.title}</div>
    ${event.venueName ? `<div style="font-size:10px;color:#71717a;margin-top:2px">${event.venueName}</div>` : ''}
  `
  // Arrow
  const arrow = document.createElement('div')
  arrow.style.cssText = `
    position: absolute; bottom: -5px; left: 50%; transform: translateX(-50%) rotate(45deg);
    width: 10px; height: 10px; background: white;
    border-right: 1px solid rgba(0,0,0,0.06);
    border-bottom: 1px solid rgba(0,0,0,0.06);
  `
  tip.appendChild(arrow)
  return tip
}

export function EventMap({ events }: EventMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<MapEvent | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const clusterMarkersRef = useRef<mapboxgl.Marker[]>([])
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [freeOnly, setFreeOnly] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [nearbyRadius, setNearbyRadius] = useState<number | null>(null)

  const handleGeolocate = () => {
    if (userLocation) {
      setUserLocation(null)
      setNearbyRadius(null)
      return
    }
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setUserLocation(loc)
        setNearbyRadius(2)
        setIsLocating(false)
        if (map.current) {
          map.current.flyTo({ center: [loc.lng, loc.lat], zoom: 14 })
        }
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true }
    )
  }

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (freeOnly && !e.isFree) return false
      if (categoryFilter && e.categorySlug !== categoryFilter) return false
      if (dateFilter !== 'all' && e.startDate) {
        const d = new Date(e.startDate)
        if (dateFilter === 'today' && !isToday(d)) return false
        if (dateFilter === 'weekend' && !isThisWeekend(d)) return false
        if (dateFilter === 'week' && !isThisWeek(d)) return false
      }
      if (userLocation && nearbyRadius) {
        const dist = haversine(userLocation.lat, userLocation.lng, e.lat, e.lng)
        if (dist > nearbyRadius) return false
      }
      return true
    })
  }, [events, dateFilter, categoryFilter, freeOnly, userLocation, nearbyRadius])

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    clusterMarkersRef.current.forEach(m => m.remove())
    clusterMarkersRef.current = []
  }, [])

  // Initialize Mapbox
  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_TOKEN) return

    mapboxgl.accessToken = MAPBOX_TOKEN

    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [2.3522, 48.8566],
      zoom: 12,
      minZoom: 10,
      maxZoom: 18,
    })

    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    map.current = m

    const initSource = () => {
      if (m.getSource('events-cluster')) return
      m.addSource('events-cluster', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 60,
      })
      setMapReady(true)
    }

    m.on('load', initSource)
    m.on('style.load', initSource)

    // Dismiss popup on map click (only if no marker was clicked)
    m.on('click', () => {
      // Small delay to let marker click fire first
      setTimeout(() => {
        if (!(window as unknown as Record<string, boolean>).__markerClicked) {
          setSelectedEvent(null)
        }
        (window as unknown as Record<string, boolean>).__markerClicked = false
      }, 50)
    })

    return () => {
      clearMarkers()
      m.remove()
    }
  }, [clearMarkers])

  // ─── Render markers from GeoJSON source (clusters + points) ───
  useEffect(() => {
    if (!map.current || !mapReady) return
    const m = map.current

    const source = m.getSource('events-cluster') as mapboxgl.GeoJSONSource | undefined
    if (!source) return

    // Build event lookup
    const eventLookup = new Map<string, MapEvent>()
    const features = filteredEvents.map((event) => {
      eventLookup.set(event.id, event)
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [event.lng, event.lat] },
        properties: { eventId: event.id },
      }
    })

    source.setData({ type: 'FeatureCollection', features })

    // Debounced render of DOM markers based on what Mapbox renders
    let renderTimeout: ReturnType<typeof setTimeout>

    const renderMarkers = () => {
      clearTimeout(renderTimeout)
      renderTimeout = setTimeout(() => {
        // Clear previous markers
        markersRef.current.forEach(mk => mk.remove())
        markersRef.current = []
        clusterMarkersRef.current.forEach(mk => mk.remove())
        clusterMarkersRef.current = []

        // Query all rendered features from the source
        const renderedFeatures = m.querySourceFeatures('events-cluster')

        // Separate clusters from individual points
        const clusters: Array<{ id: number; count: number; lng: number; lat: number }> = []
        const points: Array<{ eventId: string; lng: number; lat: number }> = []
        const seenClusters = new Set<number>()
        const seenPoints = new Set<string>()

        for (const f of renderedFeatures) {
          if (f.geometry.type !== 'Point') continue
          const [lng, lat] = f.geometry.coordinates

          if (f.properties?.cluster) {
            const clusterId = f.properties.cluster_id as number
            if (!seenClusters.has(clusterId)) {
              seenClusters.add(clusterId)
              clusters.push({ id: clusterId, count: f.properties.point_count as number, lng, lat })
            }
          } else {
            const eventId = f.properties?.eventId as string
            if (eventId && !seenPoints.has(eventId)) {
              seenPoints.add(eventId)
              points.push({ eventId, lng, lat })
            }
          }
        }

        // Render cluster markers
        for (const cluster of clusters) {
          const el = createClusterEl(cluster.count)
          el.addEventListener('click', (e) => {
            e.stopPropagation()
            ;(source as mapboxgl.GeoJSONSource).getClusterExpansionZoom(cluster.id, (err, zoom) => {
              if (err) return
              m.easeTo({ center: [cluster.lng, cluster.lat], zoom: zoom ?? 14 })
            })
          })

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([cluster.lng, cluster.lat])
            .addTo(m)
          clusterMarkersRef.current.push(marker)
        }

        // Render individual event markers
        for (const point of points) {
          const event = eventLookup.get(point.eventId)
          if (!event) continue

          const el = createMarkerEl(event)
          let tooltip: HTMLDivElement | null = null

          // Hover tooltip
          el.addEventListener('mouseenter', () => {
            tooltip = createTooltip(event)
            el.appendChild(tooltip)
          })
          el.addEventListener('mouseleave', () => {
            if (tooltip) { tooltip.remove(); tooltip = null }
          })

          // Click → show event card
          el.addEventListener('click', (e) => {
            e.stopPropagation()
            ;(window as unknown as Record<string, boolean>).__markerClicked = true
            setSelectedEvent(event)
            m.flyTo({ center: [event.lng, event.lat], zoom: 15, duration: 500 })
            if (tooltip) { tooltip.remove(); tooltip = null }
          })

          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([event.lng, event.lat])
            .addTo(m)
          markersRef.current.push(marker)
        }
      }, 100) // Debounce 100ms
    }

    // Re-render markers when the map moves/zooms (clusters change)
    m.on('moveend', renderMarkers)
    m.on('zoomend', renderMarkers)

    // Initial render after data is set
    renderMarkers()

    return () => {
      clearTimeout(renderTimeout)
      m.off('moveend', renderMarkers)
      m.off('zoomend', renderMarkers)
      markersRef.current.forEach(mk => mk.remove())
      markersRef.current = []
      clusterMarkersRef.current.forEach(mk => mk.remove())
      clusterMarkersRef.current = []
    }
  }, [filteredEvents, mapReady, clearMarkers])

  const handleLocateMe = () => {
    if (!navigator.geolocation || !map.current) return
    if (userLocation) {
      map.current.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 14, duration: 1000 })
      return
    }
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setUserLocation(loc)
        setNearbyRadius(2)
        map.current?.flyTo({ center: [loc.lng, loc.lat], zoom: 14, duration: 1000 })
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

      {/* Filter bar */}
      <div className="absolute top-3 left-3 right-14 z-10 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-white/90 backdrop-blur-sm px-3 py-1.5 shadow-sm border border-border/40">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-accent" />
              <span className="text-[12px] font-semibold text-text-primary">
                {filteredEvents.length} événement{filteredEvents.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold shadow-sm border transition-colors',
              showFilters || dateFilter !== 'all' || categoryFilter || freeOnly
                ? 'bg-accent text-white border-accent'
                : 'bg-white/90 backdrop-blur-sm text-text-primary border-border/40 hover:bg-white'
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            Filtres
            {(dateFilter !== 'all' || categoryFilter || freeOnly || userLocation) && (
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/30 text-[10px]">
                {(dateFilter !== 'all' ? 1 : 0) + (categoryFilter ? 1 : 0) + (freeOnly ? 1 : 0) + (userLocation ? 1 : 0)}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="rounded-xl bg-white/95 backdrop-blur-md shadow-lg border border-border/40 p-3 space-y-3 animate-slide-up">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {DATE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setDateFilter(f.id)}
                  className={cn(
                    'whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors',
                    dateFilter === f.id
                      ? 'bg-accent text-white'
                      : 'bg-surface-hover text-text-secondary hover:bg-surface-hover/80'
                  )}
                >
                  {f.label}
                </button>
              ))}
              <button
                onClick={() => setFreeOnly(!freeOnly)}
                className={cn(
                  'whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors',
                  freeOnly
                    ? 'bg-free text-white'
                    : 'bg-surface-hover text-text-secondary hover:bg-surface-hover/80'
                )}
              >
                🆓 Gratuit
              </button>
            </div>

            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {CATEGORY_FILTERS.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => setCategoryFilter(categoryFilter === c.slug ? null : c.slug)}
                  className={cn(
                    'whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                    categoryFilter === c.slug
                      ? 'bg-accent text-white'
                      : 'bg-surface-hover text-text-secondary hover:bg-surface-hover/80'
                  )}
                >
                  {c.icon} {c.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGeolocate}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors',
                  userLocation
                    ? 'bg-neon text-white'
                    : 'bg-surface-hover text-text-secondary hover:bg-surface-hover/80'
                )}
              >
                <Navigation className="h-3 w-3" />
                {isLocating ? 'Localisation...' : 'Autour de moi'}
              </button>
              {userLocation && nearbyRadius && (
                <select
                  value={nearbyRadius}
                  onChange={(e) => setNearbyRadius(Number(e.target.value))}
                  className="rounded-lg border border-border bg-white px-2 py-1.5 text-[11px] font-medium text-text-secondary"
                >
                  <option value={1}>1 km</option>
                  <option value={2}>2 km</option>
                  <option value={5}>5 km</option>
                  <option value={10}>10 km</option>
                </select>
              )}
            </div>

            {(dateFilter !== 'all' || categoryFilter || freeOnly || userLocation) && (
              <button
                onClick={() => { setDateFilter('all'); setCategoryFilter(null); setFreeOnly(false); setUserLocation(null); setNearbyRadius(null) }}
                className="text-[11px] font-medium text-accent hover:underline"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        )}
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
                  <img src={selectedEvent.imageUrl} alt="" className="h-full w-full object-cover" />
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
