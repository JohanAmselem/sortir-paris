'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { CalendarDays, ChevronDown, ChevronUp, Loader2, LocateFixed, X } from 'lucide-react'
import { EventCard } from '@/components/events/event-card'
import { CATEGORIES } from '@/lib/events/taxonomy'
import { MAPBOX_STYLE_URL, themeColor } from '@/lib/map-style'
import { monthTitle } from '@/lib/agenda-view'
import { nextMonthKeys } from '@/lib/paris-time'
import type { CardEvent, EventPage } from '@/lib/events/types'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
const PARIS: [number, number] = [2.3488, 48.8566]

/** Le même choix de date que l'Agenda : une fenêtre, un mois ou un jour. */
const WHEN = [
  { id: 'tonight', label: 'Ce soir' },
  { id: 'tomorrow', label: 'Demain' },
  { id: 'weekend', label: 'Week-end' },
  { id: 'week', label: '7 jours' },
  { id: 'month', label: '30 jours' },
] as const

const isPreset = (when: string) => WHEN.some((w) => w.id === when)

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
  /** Hide cinemas: hundreds of séances otherwise drown the map. */
  noCinema?: boolean
}

export interface EventMapProps {
  initialView: { lat: number; lng: number; zoom: number } | null
  initialState: MapState
}

function stateParams(s: MapState) {
  const p = new URLSearchParams({ when: s.when })
  if (s.cat) p.set('cat', s.cat)
  if (s.free) p.set('free', '1')
  if (s.noCinema && s.cat !== 'cinema') p.set('xcat', 'cinema')
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
        style: MAPBOX_STYLE_URL,
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
      // Couleurs du thème « Nuit », lues dans la feuille de style (jetons de globals.css).
      const ink = themeColor('--color-ink')
      const paper = themeColor('--color-paper')
      const accent = themeColor('--color-accent')
      const free = themeColor('--color-free')
      m.addSource('venues', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 60,
        clusterMaxZoom: 15,
        clusterProperties: { total: ['+', ['get', 'n']] },
      })
      m.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'venues',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ink,
          'circle-radius': ['step', ['get', 'total'], 16, 10, 20, 50, 26, 200, 32],
          'circle-stroke-width': 3,
          'circle-stroke-color': paper,
        },
      })
      m.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'venues',
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'total'], 'text-size': 13, 'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'] },
        paint: { 'text-color': paper },
      })
      m.addLayer({
        id: 'venue',
        type: 'circle',
        source: 'venues',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['case', ['>', ['get', 'free'], 0], free, accent],
          'circle-radius': ['interpolate', ['linear'], ['get', 'n'], 1, 8, 10, 13, 40, 18],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': paper,
        },
      })
      m.addLayer({
        id: 'venue-count',
        type: 'symbol',
        source: 'venues',
        filter: ['all', ['!', ['has', 'point_count']], ['>', ['get', 'n'], 1]],
        layout: { 'text-field': ['get', 'n'], 'text-size': 11, 'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'] },
        paint: { 'text-color': paper },
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
        paint: { 'text-color': ink, 'text-halo-color': paper, 'text-halo-width': 1.5 },
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
        el.className = 'h-4 w-4 rounded-full border-[3px] border-ink bg-accent-strong shadow-glow'
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
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface p-6 text-center">
        <p className="t-title2 text-ink">Carte indisponible</p>
        <p className="t-body max-w-sm text-text-secondary">{mapError}</p>
        <Link href="/agenda" className="t-body inline-flex h-11 items-center rounded-full bg-ink px-5 font-semibold text-paper">
          Voir l’agenda
        </Link>
      </div>
    )
  }

  const chip = 't-small h-11 shrink-0 whitespace-nowrap rounded-full border px-4 font-semibold shadow-md backdrop-blur-md transition-colors'
  const off = 'border-border-strong bg-paper/85 text-ink hover:border-ink'
  const on = 'border-ink bg-ink text-paper'
  const months = nextMonthKeys(13, now).slice(1)
  const pickedMonth = /^\d{4}-\d{2}$/.test(state.when) ? state.when : ''
  const pickedDay = /^\d{4}-\d{2}-\d{2}$/.test(state.when) ? state.when : ''

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="absolute inset-0 h-full w-full" role="region" aria-label="Carte des sorties à Paris" />

      {/* Quand, et quoi : les mêmes choix que l'Agenda */}
      <div className="absolute inset-x-0 top-0 z-10 p-3">
        <div className="rail scrollbar-hide mx-0 px-0 pb-1" role="group" aria-label="Quand ?">
          {WHEN.map((w) => (
            <button
              key={w.id}
              type="button"
              aria-pressed={state.when === w.id}
              onClick={() => setState((s) => ({ ...s, when: w.id }))}
              className={cn(chip, state.when === w.id ? on : off)}
            >
              {w.label}
            </button>
          ))}
          <label className="relative shrink-0">
            <span className="sr-only">Un mois</span>
            <select
              value={pickedMonth}
              onChange={(e) => e.target.value && setState((s) => ({ ...s, when: e.target.value }))}
              className={cn(chip, 'appearance-none pl-4 pr-9', pickedMonth ? on : off)}
            >
              <option value="">Un mois…</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthTitle(m, now)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4" aria-hidden />
          </label>
          <label className={cn(chip, 'relative flex items-center gap-2', pickedDay ? on : off)}>
            <CalendarDays className="h-4 w-4" aria-hidden />
            <span className="sr-only">Un jour précis</span>
            <input
              type="date"
              value={pickedDay}
              min={nowIso.slice(0, 10)}
              onChange={(e) => e.target.value && setState((s) => ({ ...s, when: e.target.value }))}
              className="t-small w-[8.5rem] bg-transparent font-semibold text-inherit [color-scheme:dark] focus:outline-none"
            />
          </label>
          <button
            type="button"
            aria-pressed={state.free}
            onClick={() => setState((s) => ({ ...s, free: !s.free }))}
            className={cn(chip, state.free ? 'border-free bg-free text-paper' : off)}
          >
            Gratuit
          </button>
          {state.cat !== 'cinema' && (
            <button type="button" aria-pressed={Boolean(state.noCinema)} onClick={() => setState((s) => ({ ...s, noCinema: !s.noCinema }))} className={cn(chip, state.noCinema ? on : off)}>
              Sans cinéma
            </button>
          )}
          <label className="relative shrink-0">
            <span className="sr-only">Catégorie</span>
            <select
              value={state.cat ?? ''}
              onChange={(e) => setState((s) => ({ ...s, cat: e.target.value || null }))}
              className={cn(chip, 'appearance-none pl-4 pr-9', state.cat ? on : off)}
            >
              <option value="">Tout type</option>
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.plural}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4" aria-hidden />
          </label>
        </div>
        {!isPreset(state.when) && (
          <p className="t-small mt-1 inline-flex rounded-full bg-paper/85 px-3 py-1 font-semibold text-ink backdrop-blur-md">
            {pickedDay ? new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${pickedDay}T12:00:00Z`)) : monthTitle(pickedMonth, now)}
          </p>
        )}
      </div>

      {/* Locate */}
      <button
        type="button"
        onClick={locate}
        className="t-small absolute right-3 top-32 z-10 flex h-11 items-center gap-2 rounded-full border border-border-strong bg-paper/85 px-4 font-semibold text-ink shadow-md backdrop-blur-md md:top-28"
      >
        {geo.status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LocateFixed className="h-4 w-4 text-accent" aria-hidden />}
        Autour de moi
      </button>

      {(loading || dataError || geo.status === 'error') && (
        <div className="t-small absolute left-1/2 top-44 z-10 -translate-x-1/2 rounded-full bg-ink px-4 py-2 font-semibold text-paper shadow-md md:top-40" role="status">
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
          'absolute inset-x-0 bottom-0 z-20 flex max-h-[70%] flex-col rounded-t-2xl border-t border-border-strong bg-paper shadow-xl transition-[max-height] md:inset-y-3 md:left-3 md:right-auto md:top-40 md:max-h-none md:w-[380px] md:rounded-2xl md:border',
          !panelOpen && !selected && 'max-h-[96px] md:max-h-none'
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          {selected ? (
            <div className="min-w-0">
              <p className="t-title3 truncate text-ink">{selected.name}</p>
              <p className="t-small text-text-secondary">
                {selected.n} sortie{selected.n > 1 ? 's' : ''}
                {selected.arr ? ` · ${selected.arr}` : ''} ·{' '}
                <Link href={`/lieux/${selected.slug}`} className="font-semibold text-accent underline">
                  Fiche du lieu
                </Link>
              </p>
            </div>
          ) : (
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen}>
              <p className="t-title3 text-ink">
                {totalVisible.toLocaleString('fr-FR')} sortie{totalVisible > 1 ? 's' : ''} dans cette zone
              </p>
              <p className="t-small text-text-secondary">{visible.length} lieux · zoome pour affiner</p>
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
                  <div key={i} className="skeleton h-[76px] rounded-xl" />
                ))}
              </div>
            ) : selectedEvents.length === 0 ? (
              <p className="t-body py-4 text-text-secondary">Pas de sortie pour ces filtres ici.</p>
            ) : (
              <div className="divide-y divide-border">
                {selectedEvents.map((e) => (
                  <EventCard key={e.id} event={e} variant="row" now={now} />
                ))}
              </div>
            )
          ) : visible.length === 0 ? (
            <p className="t-body py-4 text-text-secondary">{loading ? 'Chargement…' : 'Aucun lieu dans cette zone. Dézoome ou change de filtre.'}</p>
          ) : (
            <ul className="divide-y divide-border">
              {visible.slice(0, 60).map((v) => (
                <li key={v.slug}>
                  <button type="button" onClick={() => focusVenue(v)} className="flex min-h-12 w-full items-center gap-3 py-3 text-left">
                    <span className={cn('t-small flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold text-paper', v.free > 0 ? 'bg-free' : 'bg-accent')}>
                      {v.n}
                    </span>
                    <span className="min-w-0">
                      <span className="t-body block truncate font-semibold text-ink">{v.name}</span>
                      <span className="t-small block truncate text-text-secondary">
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
