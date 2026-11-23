'use client'

import { useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { EventCard } from './event-card'
import { ONGOING_KEY, countLabel, groupByDay, groupBySlot } from '@/lib/agenda-view'
import type { AgendaResponse } from '@/lib/api-v2/contract'
import type { CardEvent, EventPage } from '@/lib/events/types'
import { cn } from '@/lib/utils'

export interface DayListProps {
  initial: CardEvent[]
  /** Suite de la liste : curseur (tri par date) ou décalage (tri par distance). */
  nextCursor?: string | null
  nextOffset?: number | null
  /** `agenda` = /api/v2/agenda (curseur), `events` = /api/events (décalage, pages de lieu). */
  endpoint?: 'agenda' | 'events'
  /** Paramètres de la liste, sans curseur ni décalage. */
  params: string
  nowIso: string
  /** Début de la période : ce qui a commencé avant va dans « En cours ». */
  fromIso?: string | null
  groupBy?: 'day' | 'slot'
  /** Compteurs exacts par jour (mois choisi), sinon on compte ce qui est chargé. */
  dayCounts?: Record<string, number>
  categories?: string[]
  className?: string
}

const PAGE = 30

/**
 * La liste de l'Agenda, groupée par jour (ou par créneau pour « Ce soir »), avec
 * des en-têtes collants. « Voir plus » charge la suite par curseur, sans limite
 * de pages, et regroupe TOUT ce qui est chargé : un jour coupé entre deux pages
 * garde un seul en-tête.
 */
export function DayList({
  initial,
  nextCursor = null,
  nextOffset = null,
  endpoint = 'agenda',
  params,
  nowIso,
  fromIso = null,
  groupBy = 'day',
  dayCounts,
  categories = [],
  className,
}: DayListProps) {
  const [items, setItems] = useState<CardEvent[]>(initial)
  const [cursor, setCursor] = useState<string | null>(nextCursor)
  const [offset, setOffset] = useState<number | null>(nextOffset ?? (endpoint === 'events' && initial.length >= PAGE ? initial.length : null))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const seen = useRef(new Set(initial.map((e) => e.id)))
  const now = useMemo(() => new Date(nowIso), [nowIso])
  const from = useMemo(() => (fromIso ? new Date(fromIso) : null), [fromIso])
  const more = Boolean(cursor) || offset != null

  const groups = useMemo(() => (groupBy === 'slot' ? groupBySlot(items, now) : groupByDay(items, now, from)), [items, groupBy, now, from])

  const load = async () => {
    setLoading(true)
    setError(false)
    try {
      const sp = new URLSearchParams(params)
      let page: CardEvent[] = []
      if (endpoint === 'agenda') {
        if (cursor) sp.set('cursor', cursor)
        else if (offset != null) sp.set('offset', String(offset))
        const res = await fetch(`/api/v2/agenda?${sp}`)
        if (!res.ok) throw new Error(String(res.status))
        const body = (await res.json()) as AgendaResponse
        page = body.events
        setCursor(body.nextCursor)
        setOffset(body.nextOffset)
      } else {
        sp.set('offset', String(offset ?? items.length))
        sp.set('limit', String(PAGE))
        const res = await fetch(`/api/events?${sp}`)
        if (!res.ok) throw new Error(String(res.status))
        const body = (await res.json()) as EventPage
        page = body.events
        setOffset(body.hasMore && body.events.length > 0 ? (offset ?? items.length) + body.events.length : null)
      }
      const fresh = page.filter((e) => !seen.current.has(e.id))
      fresh.forEach((e) => seen.current.add(e.id))
      setItems((list) => [...list, ...fresh])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={className}>
      {groups.map((g, i) => {
        const last = i === groups.length - 1
        const n = dayCounts?.[g.key] ?? (!more || !last ? g.events.length : null)
        const id = `groupe-${g.key}`
        return (
          <section key={g.key} aria-labelledby={id}>
            <h2
              id={id}
              className="sticky top-14 z-10 -mx-4 flex items-baseline justify-between gap-3 border-b border-border bg-paper/95 px-4 pb-2 pt-4 backdrop-blur-md md:top-16"
            >
              <span className="t-body font-bold text-ink">{g.label}</span>
              {n != null && <span className="t-small shrink-0 text-text-muted">{countLabel(n, categories)}</span>}
            </h2>
            <ul className="divide-y divide-border">
              {g.events.map((e) => (
                <li key={e.id}>
                  <EventCard event={e} variant="row" now={now} timeOnly={groupBy === 'day' && g.key !== ONGOING_KEY} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <div className="mt-8 flex flex-col items-center gap-2" aria-live="polite">
        {error && <p className="t-small text-text-secondary">Le chargement a échoué.</p>}
        {more && (
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className={cn(
              't-body inline-flex h-12 items-center gap-2 rounded-full border border-border-strong px-6 font-semibold text-ink transition-colors hover:border-ink disabled:opacity-60'
            )}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {error ? 'Réessayer' : 'Voir plus'}
          </button>
        )}
      </div>
    </div>
  )
}
