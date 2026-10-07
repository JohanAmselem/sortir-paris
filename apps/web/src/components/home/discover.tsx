'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { ArrowRight, LocateFixed, Loader2, Sparkles } from 'lucide-react'
import { EventCard } from '@/components/events/event-card'
import { eventsHref } from '@/lib/events/params'
import type { CardEvent, EventQuery } from '@/lib/events/types'
import type { OutingIntent } from '@/lib/ai/intent-rules'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

type When = 'now' | 'tonight' | 'tomorrow' | 'weekend'
const WHEN: Array<{ id: When; label: string }> = [
  { id: 'now', label: 'maintenant' },
  { id: 'tonight', label: 'ce soir' },
  { id: 'tomorrow', label: 'demain' },
  { id: 'weekend', label: 'ce week-end' },
]

const WITH: Array<{ id: string; label: string }> = [
  { id: 'en-amoureux', label: 'à deux' },
  { id: 'entre-amis', label: 'entre amis' },
  { id: 'en-famille', label: 'en famille' },
]

type Extra = 'free' | 'budget' | 'insolite' | 'near'
const EXTRAS: Array<{ id: Extra; label: string }> = [
  { id: 'free', label: 'gratuit' },
  { id: 'budget', label: 'moins de 20 €' },
  { id: 'insolite', label: 'original' },
  { id: 'near', label: 'près de moi' },
]

interface Result {
  events: CardEvent[]
  total: number
  relaxed: string | null
  query: EventQuery
  intent?: OutingIntent
  source?: 'rules' | 'ai' | 'empty'
  needsLocation?: boolean
}

interface DiscoverProps {
  initial: Result
  nowIso: string
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-10 rounded-full border px-4 text-[15px] font-medium transition-colors',
        active
          ? 'border-paper bg-paper text-night'
          : 'border-paper/25 text-paper/85 hover:border-paper/60 hover:text-paper'
      )}
    >
      {children}
    </button>
  )
}

export function Discover({ initial, nowIso }: DiscoverProps) {
  const [when, setWhen] = useState<When>('tonight')
  const [withWho, setWithWho] = useState<string | null>(null)
  const [extras, setExtras] = useState<Set<Extra>>(new Set())
  const [text, setText] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [result, setResult] = useState<Result>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const first = useRef(true)
  const controller = useRef<AbortController | null>(null)
  const now = new Date(nowIso)

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGeoError('Ton navigateur ne partage pas ta position.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoError(null)
        track('map_locate', { from: 'discover' })
      },
      () => {
        setGeoError('Position indisponible : on cherche dans tout Paris.')
        setExtras((s) => {
          const n = new Set(s)
          n.delete('near')
          return n
        })
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 }
    )
  }, [])

  const toggleExtra = (id: Extra) => {
    setExtras((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else {
        n.add(id)
        if (id === 'free') n.delete('budget')
        if (id === 'budget') n.delete('free')
      }
      return n
    })
    if (id === 'near' && !coords) locate()
    track('intent_chip', { chip: id })
  }

  const run = useCallback(
    (fetcher: (signal: AbortSignal) => Promise<Response>) => {
      controller.current?.abort()
      const ac = new AbortController()
      controller.current = ac
      setError(null)
      startTransition(async () => {
        try {
          const res = await fetcher(ac.signal)
          if (res.status === 429) {
            setError('Doucement : trop de recherches d’un coup. Réessaie dans quelques secondes.')
            return
          }
          if (!res.ok) throw new Error(String(res.status))
          setResult((await res.json()) as Result)
        } catch (e) {
          if ((e as Error).name !== 'AbortError') setError('Impossible de charger les idées pour le moment.')
        }
      })
    },
    []
  )

  // Chips → GET (CDN-cached).
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (text) return
    const params = new URLSearchParams({ when, limit: '4' })
    const intents = [withWho, extras.has('insolite') ? 'insolite' : null].filter(Boolean) as string[]
    if (intents.length) params.set('intents', intents.join(','))
    if (extras.has('free')) params.set('free', 'true')
    if (extras.has('budget')) params.set('maxPrice', '20')
    if (extras.has('near') && coords) {
      params.set('lat', coords.lat.toFixed(3))
      params.set('lng', coords.lng.toFixed(3))
    }
    if (extras.has('near') && !coords) return // wait for the position
    run((signal) => fetch(`/api/discover?${params}`, { signal }))
  }, [when, withWho, extras, coords, text, run])

  const submitText = (e: React.FormEvent) => {
    e.preventDefault()
    const q = text.trim()
    if (q.length < 2) return
    track('ai_search', { length: q.length })
    run((signal) =>
      fetch('/api/discover', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, limit: 4, ...(coords ?? {}) }),
      })
    )
  }

  const clearText = () => setText('')

  const seeAll = eventsHref({ ...result.query, near: result.query.near ?? null })

  return (
    <section aria-labelledby="discover-title" className="relative mx-[calc(50%-50vw)] overflow-hidden bg-night text-paper">
      <div className="mx-auto max-w-3xl px-4 pb-10 pt-8 sm:pt-12">
        <h1 id="discover-title" className="font-display text-[3rem] leading-[0.9] sm:text-[4.5rem]">
          Je veux sortir…
        </h1>

        <div className="mt-6 space-y-3" role="group" aria-label="Quand ?">
          <div className="flex flex-wrap gap-2">
            {WHEN.map((w) => (
              <Chip key={w.id} active={!text && when === w.id} onClick={() => { setText(''); setWhen(w.id); track('intent_chip', { chip: w.id }) }}>
                {w.label}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Avec qui, comment ?">
            {WITH.map((w) => (
              <Chip
                key={w.id}
                active={!text && withWho === w.id}
                onClick={() => {
                  setText('')
                  setWithWho((cur) => (cur === w.id ? null : w.id))
                  track('intent_chip', { chip: w.id })
                }}
              >
                {w.label}
              </Chip>
            ))}
            {EXTRAS.map((x) => (
              <Chip key={x.id} active={!text && extras.has(x.id)} onClick={() => { setText(''); toggleExtra(x.id) }}>
                {x.id === 'near' && <LocateFixed className="-ml-1 mr-1 inline h-4 w-4" aria-hidden />}
                {x.label}
              </Chip>
            ))}
          </div>
        </div>

        <form onSubmit={submitText} className="mt-5">
          <label htmlFor="discover-text" className="mb-2 flex items-center gap-1.5 text-[14px] text-paper/80">
            <Sparkles className="h-4 w-4 text-accent-glow" aria-hidden />
            ou dis-le avec tes mots
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-paper/20 bg-paper/[0.06] p-1.5 focus-within:border-accent-glow">
            <input
              id="discover-text"
              type="search"
              enterKeyHint="search"
              maxLength={200}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="un concert pas cher dans le 11e pour deux…"
              className="h-11 min-w-0 flex-1 bg-transparent px-2.5 text-[16px] text-paper placeholder:text-paper/45 focus:outline-none"
            />
            {text && (
              <button type="button" onClick={clearText} className="h-11 px-2 text-[14px] text-paper/70 hover:text-paper">
                Effacer
              </button>
            )}
            <button
              type="submit"
              disabled={pending || text.trim().length < 2}
              className="flex h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-[15px] font-semibold text-paper transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
              <span className="sr-only sm:not-sr-only">Trouver</span>
            </button>
          </div>
        </form>

        {result.intent && text && (
          <p className="mt-3 text-[14px] text-paper/80">
            Compris : <span className="font-semibold text-paper">{result.intent.summary}</span>
            {result.source === 'ai' && <span className="ml-1.5 text-paper/50">(analyse IA)</span>}
          </p>
        )}
        {geoError && <p className="mt-3 text-[14px] text-paper/70">{geoError}</p>}
        {result.needsLocation && (
          <button type="button" onClick={locate} className="mt-3 text-[14px] font-semibold text-accent-glow underline underline-offset-2">
            Partager ma position pour chercher autour de moi
          </button>
        )}
      </div>

      <div className="bg-paper text-ink">
        <div className="mx-auto max-w-3xl px-4 pb-6 pt-4" aria-live="polite" aria-busy={pending}>
          {error ? (
            <div className="rounded-lg border border-border bg-surface p-4 text-[15px]">
              {error}{' '}
              <button type="button" className="font-semibold text-accent underline" onClick={() => setExtras((s) => new Set(s))}>
                Réessayer
              </button>
            </div>
          ) : result.events.length === 0 ? (
            <p className="py-6 text-[15px] text-text-secondary">
              Rien qui colle exactement pour l’instant.{' '}
              <Link href="/evenements" className="font-semibold text-accent underline underline-offset-2">
                Parcourir toutes les sorties
              </Link>
            </p>
          ) : (
            <>
              {result.relaxed && <p className="mb-1 text-[13px] text-text-muted">{result.relaxed}</p>}
              <div className={cn('divide-y divide-border transition-opacity', pending && 'opacity-50')}>
                {result.events.slice(0, 4).map((e) => (
                  <EventCard key={e.id} event={e} variant="row" now={now} />
                ))}
              </div>
              <Link
                href={seeAll}
                className="mt-3 inline-flex h-11 items-center gap-1.5 text-[15px] font-semibold text-accent hover:text-accent-hover"
              >
                {result.total > 4 ? `Voir les ${result.total.toLocaleString('fr-FR')} idées` : 'Voir plus d’idées'}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
