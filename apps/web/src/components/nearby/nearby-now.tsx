'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, LocateFixed } from 'lucide-react'
import { EventCard } from '@/components/events/event-card'
import { NearbyMapWrapper } from '@/components/map/nearby-map-wrapper'
import { ARRONDISSEMENTS } from '@/lib/events/taxonomy'
import { formatDistance } from '@/lib/format'
import { RADII, inParisArea, museumHours, nearbyParams, roundCoord, venuePins, type NearbyWhere, type Radius } from '@/lib/nearby'
import type { CardEvent, EventPage } from '@/lib/events/types'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

type GeoState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ok'; lat: number; lng: number }
  | { status: 'error'; message: string }

interface Results {
  events: CardEvent[]
  expos: CardEvent[]
}

const chip = (active: boolean) =>
  cn(
    'inline-flex h-11 min-w-[3.5rem] items-center justify-center rounded-full border px-4 text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
    active ? 'border-ink bg-ink text-paper' : 'border-border-strong bg-surface text-ink hover:border-ink'
  )

async function fetchPage(params: string): Promise<CardEvent[]> {
  const res = await fetch(`/api/events?${params}`)
  if (!res.ok) throw new Error(String(res.status))
  return ((await res.json()) as EventPage).events
}

export function NearbyNow() {
  const [geo, setGeo] = useState<GeoState>({ status: 'idle' })
  const [arr, setArr] = useState('')
  const [radius, setRadius] = useState<Radius>(2)
  const [noCinema, setNoCinema] = useState(true)
  const [results, setResults] = useState<Results | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const now = new Date()

  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeo({ status: 'error', message: 'Ton navigateur ne donne pas ta position. Choisis plutôt un arrondissement.' })
      return
    }
    setGeo({ status: 'locating' })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        if (!inParisArea(lat, lng)) {
          setGeo({ status: 'error', message: 'Tu sembles loin de Paris. Choisis un arrondissement pour voir ce qui s’y passe.' })
          return
        }
        // Rounded right away: the exact position never leaves this function.
        setGeo({ status: 'ok', lat: roundCoord(lat), lng: roundCoord(lng) })
        setArr('')
        track('map_locate', { from: 'autour-de-moi' })
      },
      (err) =>
        setGeo({
          status: 'error',
          message:
            err.code === 1
              ? 'Localisation refusée. Pas de souci : choisis un arrondissement.'
              : 'Position introuvable pour le moment. Réessaie, ou choisis un arrondissement.',
        }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 120_000 }
    )
  }, [])

  // Already allowed earlier: locate without asking again.
  useEffect(() => {
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        if (p.state === 'granted') locate()
      })
      .catch(() => {})
  }, [locate])

  const where: NearbyWhere | null = useMemo(
    () => (geo.status === 'ok' ? { lat: geo.lat, lng: geo.lng, radius } : arr ? { arr } : null),
    [geo, radius, arr]
  )

  useEffect(() => {
    if (!where) return
    let cancelled = false
    const p = nearbyParams(where, noCinema)
    setLoading(true)
    setFailed(false)
    Promise.all([fetchPage(p.events), museumHours(new Date()) ? fetchPage(p.expos).catch(() => []) : Promise.resolve([])])
      .then(([events, expos]) => {
        if (!cancelled) setResults({ events, expos })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [where, noCinema])

  const pins = useMemo(() => venuePins(results?.events ?? []), [results])
  const pinOf = useMemo(() => new Map(pins.map((p) => [p.key, p.label])), [pins])
  const geoOk = geo.status === 'ok'

  return (
    <div className="mt-2">
      {/* Where */}
      <div className="rounded-xl border border-border bg-surface p-4">
        {!geoOk && (
          <button
            type="button"
            onClick={locate}
            disabled={geo.status === 'locating'}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-[16px] font-semibold text-paper transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-70 sm:w-auto"
          >
            {geo.status === 'locating' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <LocateFixed className="h-5 w-5" aria-hidden />}
            {geo.status === 'locating' ? 'Localisation…' : 'Me localiser'}
          </button>
        )}
        {geoOk && (
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <LocateFixed className="h-4 w-4 text-accent" aria-hidden />
            Autour de ta position
            <button type="button" onClick={locate} className="ml-auto inline-flex h-10 items-center text-[14px] font-semibold text-accent hover:underline">
              Actualiser
            </button>
          </p>
        )}
        {geo.status === 'error' && (
          <p className="mt-3 text-[15px] text-ink" role="alert">
            {geo.message}
          </p>
        )}
        <p className="mt-3 text-[13px] text-text-secondary">
          Ta position reste sur ton appareil : elle sert seulement à trier les sorties, arrondie à 200 m, et n’est jamais enregistrée.
        </p>

        <div className="mt-4">
          <label htmlFor="nearby-arr" className="block text-[14px] font-semibold text-ink">
            {geoOk ? 'Ou regarde un arrondissement' : 'Sans localisation : choisis un arrondissement'}
          </label>
          <select
            id="nearby-arr"
            value={arr}
            onChange={(e) => {
              setArr(e.target.value)
              if (e.target.value) setGeo({ status: 'idle' })
            }}
            className="mt-1.5 h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-[16px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-60"
          >
            <option value="">—</option>
            {ARRONDISSEMENTS.map((a) => (
              <option key={a} value={a}>
                Paris {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        {geoOk && (
          <div role="group" aria-label="Rayon" className="flex items-center gap-2">
            {RADII.map((r) => (
              <button key={r} type="button" aria-pressed={radius === r} onClick={() => setRadius(r)} className={chip(radius === r)}>
                {r} km
              </button>
            ))}
          </div>
        )}
        <label className="inline-flex h-11 cursor-pointer items-center gap-3 text-[15px] font-semibold text-ink">
          <input
            type="checkbox"
            role="switch"
            checked={noCinema}
            aria-checked={noCinema}
            onChange={(e) => setNoCinema(e.target.checked)}
            className="h-5 w-5 accent-accent"
          />
          Sans cinéma
        </label>
      </div>

      {/* Results */}
      <div aria-live="polite" aria-busy={loading} className="mt-6">
        {!where && (
          <p className="text-[15px] text-text-secondary">Localise-toi ou choisis un arrondissement pour voir ce qui commence bientôt.</p>
        )}
        {where && loading && !results && (
          <p className="flex items-center gap-2 text-[15px] text-text-secondary" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Recherche des sorties…
          </p>
        )}
        {where && failed && (
          <p className="text-[15px] text-ink" role="alert">
            Impossible de charger les sorties pour le moment. Réessaie dans un instant.
          </p>
        )}
        {where && results && !failed && (
          <>
            {geoOk && (
              <div className="relative h-56 overflow-hidden rounded-xl border border-border sm:h-72" role="region" aria-label="Carte des lieux autour de toi">
                <NearbyMapWrapper center={{ lat: geo.lat, lng: geo.lng }} radiusKm={radius} pins={pins} />
              </div>
            )}

            <h2 className="font-display mt-6 text-[1.8rem] text-ink">
              {results.events.length === 0
                ? 'Rien dans les 3 heures'
                : `${results.events.length}${results.events.length >= 30 ? '+' : ''} sortie${results.events.length > 1 ? 's' : ''} dans les 3 heures`}
            </h2>
            {loading && <p className="sr-only">Mise à jour…</p>}

            {results.events.length === 0 ? (
              <div className="mt-2 text-[15px] text-text-secondary">
                <p>
                  {geoOk ? `Rien ne commence dans un rayon de ${radius} km d’ici 3 heures.` : 'Rien ne commence dans cet arrondissement d’ici 3 heures.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {geoOk && radius < 5 && (
                    <button type="button" onClick={() => setRadius(radius === 1 ? 2 : 5)} className={chip(false)}>
                      Élargir à {radius === 1 ? 2 : 5} km
                    </button>
                  )}
                  {noCinema && (
                    <button type="button" onClick={() => setNoCinema(false)} className={chip(false)}>
                      Inclure le cinéma
                    </button>
                  )}
                  <Link href="/ce-soir" className={chip(false)}>
                    Tout ce soir
                  </Link>
                </div>
              </div>
            ) : (
              <ol className="mt-2 divide-y divide-border">
                {results.events.map((e) => {
                  const pin = e.venue ? pinOf.get(e.venue.slug) : undefined
                  const dist = formatDistance(e.distanceKm)
                  return (
                    <li key={e.id} className="flex items-start gap-3">
                      {geoOk && (
                      <div className="w-12 shrink-0 pt-4 text-center">
                        {pin && (
                          <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-paper" aria-label={`Repère ${pin}`}>
                            {pin}
                          </span>
                        )}
                        {dist && <span className="mt-1 block text-[12px] font-semibold text-text-secondary">{dist}</span>}
                      </div>
                      )}
                      <EventCard event={e} variant="row" now={now} className="min-w-0 flex-1" />
                    </li>
                  )
                })}
              </ol>
            )}

            {results.expos.length > 0 && (
              <section className="mt-10" aria-labelledby="expos-now-title">
                <h2 id="expos-now-title" className="font-display text-[1.8rem] text-ink">
                  Expos en cours à côté
                </h2>
                <p className="mt-1 text-[14px] text-text-secondary">Les horaires d’ouverture varient : vérifie avant d’y aller.</p>
                <ul className="mt-2 divide-y divide-border">
                  {results.expos.map((e) => (
                    <li key={e.id} className="flex items-start gap-3">
                      {geoOk && (
                        <span className="w-12 shrink-0 pt-4 text-center text-[12px] font-semibold text-text-secondary">{formatDistance(e.distanceKm) ?? ''}</span>
                      )}
                      <EventCard event={e} variant="row" now={now} className="min-w-0 flex-1" />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
