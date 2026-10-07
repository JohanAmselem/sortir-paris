'use client'

import { useId, useState } from 'react'
import { EventCard } from '@/components/events/event-card'
import type { CardEvent } from '@/lib/events/types'
import { cn } from '@/lib/utils'

export interface ProgramDay {
  key: string
  label: string
  events: CardEvent[]
}

/** "Ce week-end" as a printed programme: one tab per day, a short ranked list. */
export function WeekendProgram({ days, nowIso }: { days: ProgramDay[]; nowIso: string }) {
  const [active, setActive] = useState(days.findIndex((d) => d.events.length > 0) === -1 ? 0 : days.findIndex((d) => d.events.length > 0))
  const id = useId()
  const now = new Date(nowIso)

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + days.length) % days.length
    setActive(next)
    document.getElementById(`${id}-tab-${next}`)?.focus()
  }

  return (
    <div>
      <div role="tablist" aria-label="Jour" className="flex gap-1 border-b border-border">
        {days.map((d, i) => (
          <button
            key={d.key}
            id={`${id}-tab-${i}`}
            role="tab"
            type="button"
            aria-selected={active === i}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'relative h-12 px-4 text-[16px] font-semibold transition-colors',
              active === i ? 'text-ink' : 'text-text-muted hover:text-ink'
            )}
          >
            {d.label}
            <span className="ml-1.5 text-[13px] font-normal text-text-muted">{d.events.length}</span>
            {active === i && <span aria-hidden className="absolute inset-x-3 -bottom-px h-[3px] bg-accent" />}
          </button>
        ))}
      </div>
      {days.map((d, i) => (
        <div
          key={d.key}
          id={`${id}-panel-${i}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${i}`}
          hidden={active !== i}
          className="divide-y divide-border"
        >
          {d.events.length === 0 ? (
            <p className="py-6 text-[15px] text-text-secondary">Pas encore de sorties repérées ce jour-là.</p>
          ) : (
            d.events.map((e) => <EventCard key={e.id} event={e} variant="row" now={now} />)
          )}
        </div>
      ))}
    </div>
  )
}
