'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { ChevronDown, ChevronUp, Loader2, LocateFixed, X } from 'lucide-react'
import { EventCard } from '@/components/events/event-card'
import { CATEGORIES } from '@/lib/events/taxonomy'
import type { CardEvent, EventPage } from '@/lib/events/types'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
const PARIS: [number, number] = [2.3488, 48.8566]

const WHEN = [
  { id: 'tonight', label: 'Ce soir' },
  { id: 'tomorrow', label: 'Demain' },
  { id: 'weekend', label: 'Week-end' },
  { id: 'week', label: '7 jours' },
] as const

interface VenueProps {
  slug: string
  name: string
  arr: string | null
  n: number
  free: number
  cat: string
  top: string
}

interface MapState {
  when: string
  cat: string | null
  free: boolean
}

export interface EventMapProps {
  initialView: { lat: number; lng: number; zoom: number } | null
  initialState: MapState
}

function stateParams(s: MapState) {
  const p = new URLSearchParams({ when: s.when })
  if (s.cat) p.set('cat', s.cat)
  if (s.free) p.set('free', '1')
  return p
}

export function EventMap({ initialView, initialState }: EventMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const userMarker = useRef<mapboxgl.Marker | null>(null)
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(TOKEN ? null : 'La carte n’est pas configurée.')
  const [state, setState] = useState<MapState>(initialState)
  const [data, setData] = useState<GeoJSON.FeatureCollection<GeoJSON.Point, VenueProps> | null>(null)
  const [loading, setLoading] = useState(false)
  const [dataError, setDataError] = useState(false)
  const [visible, setVisible] = useState<VenueProps[]>([])
  const [selected, setSelected] = useState<VenueProps | null>(null)
  const [selectedEvents, setSelectedEvents] = useState<CardEvent[] | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [geo, setGeo] = useState<{ status: 'idle' | 'loading' | 'error'; message?: string }>({ status: 'idle' })
  const nowIso = useMemo(() => new Date().toISOString(), [])

  // ── Init map ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!TOKEN || !container.current || map.current) return
    mapboxgl.accessToken = TOKEN
    let m: mapboxgl.Map
    try {
      m = new mapboxgl.Map({
        container: container.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: initialView ? [initialView.lng, initialView.lat] : PARIS,
        zoom: initialView?.zoom ?? 12,
        minZoom: 9,
        maxBounds: [
          [1.4, 48.1],
          [3.6, 49.3],
        ],
        attributionControl: false,
        cooperativeGestures: false,
      })
    } catch {
      setMapError('Ton navigateur ne peut pas afficher la carte (WebGL indisponible).')
      return
    }
    map.current = m
    m.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    m.on('error', (e) => {
      if (String(e.error?.message ?? '').match(/401|403|token/i)) setMapError('La carte est momentanément indisponible.')
    })

    m.on('load', () => {
      m.addSource('venues', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 44,
        clusterMaxZoom: 15,
        clusterProperties: { total: ['+', ['get', 'n']] },
      })
      m.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'venues',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#1c1730',
          'circle-radius': ['step', ['get', 'total'], 16, 10, 20, 50, 26, 200, 32],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#f7f5ef',
        },
      })
      m.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'venues',
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'total'], 'text-size': 13, 'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'] },
        paint: { 'text-color': '#f7f5ef' },
      })
      m.addLayer({
        id: 'venue',
        type: 'circle',
        source: 'venues',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['case', ['>', ['get', 'free'], 0], '#0f8a5f', '#7c3aed'],
          'circle-radius': ['interpolate', ['linear'], ['get', 'n'], 1, 8, 10, 13, 40, 18],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      })
      m.addLayer({
        id: 'venue-count',
        type: 'symbol',
        source: 'venues',
        filter: ['all', ['!', ['has', 'point_count']], ['>', ['get', 'n'], 1]],
        layout: { 'text-field': ['get', 'n'], 'text-size': 11, 'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'] },
        paint: { 'text-color': '#ffffff' },
      })
      m.addLayer({
        id: 'venue-label',
        type: 'symbol',
        source: 'venues',
        filter: ['!', ['has', 'point_count']],
        minzoom: 14,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-optional': true,
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
        },
        paint: { 'text-color': '#1c1730', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      })

      m.on('click', 'clusters', (e) => {
        const f = e.features?.[0]
        if (!f) return
        const src = m.getSource('venues') as mapboxgl.GeoJSONSource
        src.getClusterExpansionZoom(f.properties!.cluster_id, (err, zoom) => {
          if (err || zoom == null) return
          m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.5 })
        })
      })
      m.on('click', 'venue', (e) => {
        const f = e.features?.[0]
        if (!f) return
        setSelected(f.properties as unknown as VenueProps)
        track('map_select')
      })
      for (const id of ['clusters', 'venue']) {
        m.on('mouseenter', id, () => (m.getCanvas().style.cursor = 'pointer'))
        m.on('mouseleave', id, () => (m.getCanvas().style.cursor = ''))
      }
      setReady(true)
    })

    track('map_open')
    return () => {
      m.remove()
      map.current = null
    }
  }, [initialView])

  // ── Data ─────────────────────────────────────────────────────────────────
  const loadData = useCallback(async (s: MapState) => {
    setLoading(true)
    setDataError(false)
    try {
      const res = await fetch(`/api/map?${stateParams(s)}`)
      if (!res.ok) throw new Error(String(res.status))
      setData(await res.json())
    } catch {
      setDataError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData(state)
  }, [state, loadData])

  useEffect(() => {
    if (!ready || !data || !map.current) return
    ;(map.current.getSource('venues') as mapboxgl.GeoJSONSource).setData(data)
  }, [ready, data])

  // ── Venues in the viewport (list sync) + URL sync ────────────────────────
  const syncViewport = useCallback(() => {
    const m = map.current
    if (!m || !data) return
    const b = m.getBounds()
    if (!b) return
    const inView = data.features
      .filter((f) => b.contains(f.geometry.coordinates as [number, number]))
      .map((f) => f.properties)
      .sort((a, b2) => b2.n - a.n)
    setVisible(inView)
    const c = m.getCenter()
    const p = stateParams(state)
    p.set('lat', c.lat.toFixed(4))
    p.set('lng', c.lng.toFixed(4))
    p.set('zoom', m.getZoom().toFixed(1))
    window.history.replaceState(null, '', `/carte?${p}`)
  }, [data, state])

  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    syncViewport()
    m.on('moveend', syncViewport)
    return () => {
      m.off('moveend', syncViewport)
    }
  }, [ready, syncViewport])

  // ── Selection: load the venue's events ──────────────────────────────────
  useEffect(() => {
    if (!selected) return
    setSelectedEvents(null)
    const p = stateParams(state)
    p.set('venue', selected.slug)
    p.set('sort', 'soon')
    p.set('limit', '12')
    const ac = new AbortController()
    fetch(`/api/events?${p}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((page: EventPage) => setSelectedEvents(page.events))
      .catch((e) => {
        if (e?.name !== 'AbortError') setSelectedEvents([])
      })
    return () => ac.abort()
  }, [selected, state])

  // Close selection with Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const locate = () => {
    if (!('geolocation' in navigator)) return setGeo({ status: 'error', message: 'Géolocalisation indisponible.' })
    setGeo({ status: 'loading' })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lngLat: [number, number] = [pos.coords.longitude, pos.coords.latitude]
        setGeo({ status: 'idle' })
        if (!map.current) return
        if (pos.coords.latitude < 48.1 || pos.coords.latitude > 49.3 || pos.coords.longitude < 1.4 || pos.coords.longitude > 3.6) {
          setGeo({ status: 'error', message: 'Tu sembles loin de Paris : on reste centré sur la ville.' })
          return
        }
        userMarker.current?.remove()
        const el = document.createElement('div')
        el.className = 'h-4 w-4 rounded-full border-[3px] border-white bg-[#2563eb] shadow-[0_0_0_6px_rgba(37,99,235,0.2)]'
        el.setAttribute('aria-label', 'Ma position')
        userMarker.current = new mapboxgl.Marker({ element: el }).setLngLat(lngLat).addTo(map.current)
        map.current.flyTo({ center: lngLat, zoom: 14.5 })
        track('map_locate', { from: 'map' })
      },
      (err) => setGeo({ status: 'error', message: err.code === 1 ? 'Autorise la localisation pour voir ce qu’il y a autour de toi.' : 'Position introuvable pour le moment.' }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60_000 }
    )
  }

  const focusVenue = (v: VenueProps) => {
    const f = data?.features.find((x) => x.properties.slug === v.slug)
    if (f && map.current) map.current.easeTo({ center: f.geometry.coordinates as [number, number], zoom: Math.max(map.current.getZoom(), 15) })
    setSelected(v)
  }

  const totalVisible = visible.reduce((s, v) => s + v.n, 0)
  const now = new Date(nowIso)

  if (mapError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-paper-deep p-6 text-center">
        <p className="font-display text-[2rem]">Carte indisponible</p>
        <p className="max-w-sm text-[15px] text-text-secondary">{mapError}</p>
        <Link href="/evenements" className="inline-flex h-11 items-center rounded-full bg-ink px-5 text-[15px] font-semibold text-paper">
          Voir la liste des sorties
        </Link>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="absolute inset-0" role="region" aria-label="Carte des sorties à Paris" />

      {/* Filters */}
      <div className="absolute inset-x-0 top-0 z-10 p-3">
        <div className="rail scrollbar-hide mx-0 px-0">
          {WHEN.map((w) => (
            <button
              key={w.id}
              type="button"
              aria-pressed={state.when === w.id}
              onClick={() => setState((s) => ({ ...s, when: w.id }))}
              className={cn('h-10 rounded-full px-4 text-[14px] font-semibold shadow-md', state.when === w.id ? 'bg-ink text-paper' : 'bg-surface text-ink')}
            >
              {w.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={state.free}
            onClick={() => setState((s) => ({ ...s, free: !s.free }))}
            className={cn('h-10 rounded-full px-4 text-[14px] font-semibold shadow-md', state.free ? 'bg-free text-paper' : 'bg-surface text-ink')}
          >
            Gratuit
          </button>
          <label className="relative">
            <span className="sr-only">Catégorie</span>
            <select
              value={state.cat ?? ''}
              onChange={(e) => setState((s) => ({ ...s, cat: e.target.value || null }))}
              className="h-10 appearance-none rounded-full bg-surface pl-4 pr-9 text-[14px] font-semibold text-ink shadow-md"
            >
              <option value="">Tout type</option>
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.plural}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4" aria-hidden />
          </label>
        </div>
      </div>

      {/* Locate */}
      <button
        type="button"
        onClick={locate}
        className="absolute right-3 top-28 z-10 flex h-11 items-center gap-2 rounded-full bg-surface px-4 text-[14px] font-semibold text-ink shadow-md md:top-24"
      >
        {geo.status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LocateFixed className="h-4 w-4 text-accent" aria-hidden />}
        Autour de moi
      </button>

      {(loading || dataError || geo.status === 'error') && (
        <div className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper shadow-md" role="status">
          {loading ? 'Chargement…' : dataError ? (
            <button type="button" onClick={() => loadData(state)} className="underline">
              Erreur de chargement, réessayer
            </button>
          ) : (
            geo.message
          )}
        </div>
      )}

      {/* Panel: selected venue, or venues in view */}
      <section
        aria-label={selected ? `Programme de ${selected.name}` : 'Lieux dans cette zone'}
        className={cn(
          'absolute inset-x-0 bottom-0 z-20 flex max-h-[70%] flex-col rounded-t-2xl bg-paper shadow-[0_-8px_24px_-12px_rgba(28,23,48,0.35)] transition-[max-height] md:inset-y-3 md:left-3 md:right-auto md:max-h-none md:w-[380px] md:rounded-2xl',
          !panelOpen && !selected && 'max-h-[96px] md:max-h-none'
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          {selected ? (
            <div className="min-w-0">
              <p className="truncate text-[17px] font-semibold text-ink">{selected.name}</p>
              <p className="text-[13px] text-text-secondary">
                {selected.n} sortie{selected.n > 1 ? 's' : ''}
                {selected.arr ? ` · ${selected.arr}` : ''} ·{' '}
                <Link href={`/lieux/${selected.slug}`} className="font-semibold text-accent underline">
                  Fiche du lieu
                </Link>
              </p>
            </div>
          ) : (
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen}>
              <p className="text-[17px] font-semibold text-ink">
                {totalVisible.toLocaleString('fr-FR')} sortie{totalVisible > 1 ? 's' : ''} dans cette zone
              </p>
              <p className="text-[13px] text-text-secondary">{visible.length} lieux · zoome pour affiner</p>
            </button>
          )}
          {selected ? (
            <button type="button" onClick={() => setSelected(null)} aria-label="Fermer" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-surface-hover">
              <X className="h-5 w-5" aria-hidden />
            </button>
          ) : (
            <button type="button" onClick={() => setPanelOpen((o) => !o)} aria-label={panelOpen ? 'Réduire la liste' : 'Afficher la liste'} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-surface-hover md:hidden">
              {panelOpen ? <ChevronDown className="h-5 w-5" aria-hidden /> : <ChevronUp className="h-5 w-5" aria-hidden />}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          {selected ? (
            selectedEvents == null ? (
              <div className="space-y-3 py-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-[72px] rounded-md" />
                ))}
              </div>
            ) : selectedEvents.length === 0 ? (
              <p className="py-4 text-[15px] text-text-secondary">Pas de sortie pour ces filtres ici.</p>
            ) : (
              <div className="divide-y divide-border">
                {selectedEvents.map((e) => (
                  <EventCard key={e.id} event={e} variant="row" now={now} />
                ))}
              </div>
            )
          ) : visible.length === 0 ? (
            <p className="py-4 text-[15px] text-text-secondary">{loading ? 'Chargement…' : 'Aucun lieu dans cette zone. Dézoome ou change de filtre.'}</p>
          ) : (
            <ul className="divide-y divide-border">
              {visible.slice(0, 60).map((v) => (
                <li key={v.slug}>
                  <button type="button" onClick={() => focusVenue(v)} className="flex w-full items-center gap-3 py-3 text-left">
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-paper', v.free > 0 ? 'bg-free' : 'bg-accent')}>
                      {v.n}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-ink">{v.name}</span>
                      <span className="block truncate text-[13px] text-text-secondary">
                        {v.top}
                        {v.arr ? ` · ${v.arr}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
