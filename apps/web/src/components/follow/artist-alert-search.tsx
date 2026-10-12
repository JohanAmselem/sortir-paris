'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BellRing, CalendarDays, Loader2, Music, Plus, Search, X } from 'lucide-react'
import { artistDisplayName, artistKey, isValidArtistKey } from '@/lib/artists'
import { formatWhen } from '@/lib/paris-time'
import { track } from '@/lib/analytics'
import { startPendingFollow } from '@/lib/pending-follow'
import { cn } from '@/lib/utils'

interface Suggestion {
  key: string
  name: string
  dates: number
}

interface DateRow {
  slug: string
  title: string
  startDate: string
  timeKnown: boolean
  venueName: string | null
}

interface Selected {
  key: string
  name: string
  /** Upcoming dates announced by the suggestion (0 for a typed name). */
  count: number
}

type Status = { state: 'idle' } | { state: 'busy' } | { state: 'done'; label: string } | { state: 'error'; message: string }

/**
 * « Alertes concerts » demo, usable without an account: search an artist
 * (suggestions with their number of Paris dates, or any name), see the next
 * dates, create the alert. Visitors keep their choice while they log in
 * (pending follow); members follow in one click.
 */
export function ArtistAlertSearch({
  source,
  compact = false,
  returnTo,
  className,
}: {
  /** Analytics: where the search is shown. */
  source: 'landing' | 'home' | 'onboarding'
  /** Smaller (home): fewer dates shown. */
  compact?: boolean
  /** Visitors come back here after logging in (default: the current page). */
  returnTo?: string
  className?: string
}) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Selected | null>(null)
  const [dates, setDates] = useState<DateRow[] | null>(null)
  const [datesLoading, setDatesLoading] = useState(false)
  const [status, setStatus] = useState<Status>({ state: 'idle' })
  const searched = useRef(false)
  const id = useId()

  const key = artistKey(query)
  useEffect(() => {
    if (key.length < 2 || selected) {
      setSuggestions([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      setLoading(true)
      fetch(`/api/artists/suggest?q=${encodeURIComponent(key)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { artists: [] }))
        .then((d: { artists?: Suggestion[] }) => {
          const list = d.artists ?? []
          setSuggestions(list)
          if (!searched.current) {
            searched.current = true
            track('alerts_search', { source, results: list.length })
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }, 200)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [key, selected, source])

  // Dates of the chosen artist (cached API, 10 at most).
  useEffect(() => {
    if (!selected || selected.count === 0) {
      setDates(selected ? [] : null)
      return
    }
    const ctrl = new AbortController()
    setDatesLoading(true)
    fetch(`/api/artists/${encodeURIComponent(selected.key)}/dates`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { dates: [] }))
      .then((d: { dates?: DateRow[] }) => setDates(d.dates ?? []))
      .catch(() => {})
      .finally(() => setDatesLoading(false))
    return () => ctrl.abort()
  }, [selected])

  const choose = (s: Selected) => {
    setSelected(s)
    setQuery(s.name)
    setSuggestions([])
    setStatus({ state: 'idle' })
  }

  const reset = () => {
    setSelected(null)
    setQuery('')
    setDates(null)
    setStatus({ state: 'idle' })
  }

  const createAlert = async () => {
    if (!selected || status.state === 'busy') return
    track('alerts_cta_click', { source, hasDates: selected.count > 0 })
    setStatus({ state: 'busy' })
    try {
      const res = await fetch('/api/follows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'artist', term: selected.key, label: selected.name }),
      })
      if (res.status === 401) {
        track('alerts_pending_follow_created', { kind: 'artist', from: source })
        startPendingFollow({ kind: 'artist', term: selected.key, label: selected.name }, returnTo)
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string; label?: string }
      if (!res.ok) {
        setStatus({ state: 'error', message: data.error ?? 'Échec, réessaie.' })
        return
      }
      track('follow', { kind: 'artist' })
      setStatus({ state: 'done', label: data.label ?? selected.name })
    } catch {
      setStatus({ state: 'error', message: 'Connexion perdue, réessaie.' })
    }
  }

  const typedName = artistDisplayName(query)
  const canUseTyped = !selected && isValidArtistKey(key) && !suggestions.some((s) => s.key === key)
  const shownDates = (dates ?? []).slice(0, compact ? 3 : 10)

  return (
    <div className={className}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          if (selected) return
          const exact = suggestions.find((s) => s.key === key) ?? (suggestions.length === 1 ? suggestions[0] : null)
          if (exact) choose({ key: exact.key, name: exact.name, count: exact.dates })
          else if (canUseTyped) choose({ key, name: typedName, count: 0 })
        }}
      >
        <label htmlFor={`${id}-q`} className={cn('font-semibold text-ink', compact ? 'text-[14px]' : 'text-[15px]')}>
          Quel artiste veux-tu suivre ?
        </label>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            id={`${id}-q`}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              if (selected) {
                setSelected(null)
                setDates(null)
                setStatus({ state: 'idle' })
              }
            }}
            placeholder="Un groupe, une chanteuse, un DJ…"
            autoComplete="off"
            maxLength={120}
            aria-controls={`${id}-list`}
            className="h-12 w-full rounded-full border border-border-strong bg-surface pl-11 pr-11 text-[16px] text-ink placeholder:text-text-muted focus:border-ink focus:outline-none"
          />
          {loading ? (
            <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-muted" aria-hidden />
          ) : (
            query && (
              <button
                type="button"
                onClick={reset}
                className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:bg-surface-hover hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden />
                <span className="sr-only">Effacer</span>
              </button>
            )
          )}
        </div>
      </form>

      {!selected && (suggestions.length > 0 || canUseTyped) && (
        <ul id={`${id}-list`} className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {suggestions.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => choose({ key: s.key, name: s.name, count: s.dates })}
                className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-hover"
              >
                <Music className="h-5 w-5 shrink-0 text-accent" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink">{s.name}</span>
                  <span className="block text-[13px] text-text-secondary">
                    {s.dates} date{s.dates > 1 ? 's' : ''} à venir à Paris
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              </button>
            </li>
          ))}
          {canUseTyped && (
            <li>
              <button
                type="button"
                onClick={() => choose({ key, name: typedName, count: 0 })}
                className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-hover"
              >
                <Plus className="h-5 w-5 shrink-0 text-accent" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink">{typedName}</span>
                  <span className="block text-[13px] text-text-secondary">Pas de date annoncée pour l’instant</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              </button>
            </li>
          )}
        </ul>
      )}

      {selected && (
        <div className="mt-3 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-live="polite">
          <p className="flex items-center gap-2 text-[17px] font-semibold text-ink">
            <Music className="h-5 w-5 shrink-0 text-accent" aria-hidden />
            <span className="min-w-0 truncate">{selected.name}</span>
          </p>

          {selected.count === 0 ? (
            <p className="mt-2 text-[14px] text-text-secondary">
              Pas de date pour l’instant — on te prévient dès qu’une date est annoncée.
            </p>
          ) : datesLoading && !dates ? (
            <p className="mt-3 flex items-center gap-2 text-[14px] text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Recherche des prochaines dates…
            </p>
          ) : shownDates.length ? (
            <>
              <p className="mt-2 text-[14px] text-text-secondary">
                {selected.count > 1 ? `${selected.count} dates à venir à Paris` : 'Prochaine date à Paris'} :
              </p>
              <ul className="mt-2 space-y-1.5">
                {shownDates.map((d) => (
                  <li key={d.slug} className="flex items-start gap-2 text-[14px]">
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden />
                    <Link href={`/evenements/${d.slug}`} className="min-w-0 text-ink hover:underline">
                      <span className="font-semibold">{formatWhen(d)}</span>
                      {d.venueName && <span className="text-text-secondary"> · {d.venueName}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
              {selected.count > shownDates.length && (
                <p className="mt-1 text-[13px] text-text-muted">
                  et {selected.count - shownDates.length} autre{selected.count - shownDates.length > 1 ? 's' : ''}
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-[14px] text-text-secondary">
              Pas de date pour l’instant — on te prévient dès qu’une date est annoncée.
            </p>
          )}

          {status.state === 'done' ? (
            <p role="status" className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-accent-soft p-3 text-[14px] font-semibold text-accent">
              <BellRing className="h-4 w-4 shrink-0" aria-hidden />
              Alerte activée pour {status.label}.
              <Link href="/compte/artistes" className="underline underline-offset-2">
                Gérer mes alertes
              </Link>
            </p>
          ) : (
            <button
              type="button"
              onClick={createAlert}
              disabled={status.state === 'busy'}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-2 text-center text-[15px] font-semibold text-paper transition-colors hover:bg-accent-hover disabled:opacity-70 sm:w-auto"
            >
              {status.state === 'busy' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BellRing className="h-4 w-4" aria-hidden />}
              Créer mon alerte pour {selected.name}
            </button>
          )}
          {status.state === 'error' && (
            <p role="alert" className="mt-2 text-[14px] font-medium text-error">
              {status.message}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
