'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { LocateFixed, SlidersHorizontal, X } from 'lucide-react'
import { ARRONDISSEMENTS, CATEGORIES, INTENTS } from '@/lib/events/taxonomy'
import { countFilters, eventsHref } from '@/lib/events/params'
import type { EventQuery, SortKey } from '@/lib/events/types'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

type Lockable = 'when' | 'categories' | 'arrondissements' | 'free'

interface FilterBarProps {
  query: EventQuery
  basePath: string
  /** Filters fixed by the page itself (e.g. /ce-soir locks "when"). */
  locked?: Lockable[]
  total?: number
}

const WHEN_OPTIONS = [
  { id: 'tonight', label: 'Ce soir' },
  { id: 'tomorrow', label: 'Demain' },
  { id: 'weekend', label: 'Week-end' },
  { id: 'week', label: 'Semaine' },
]

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'relevance', label: 'Recommandés' },
  { id: 'soon', label: 'Les plus proches dans le temps' },
  { id: 'popular', label: 'Les plus populaires' },
  { id: 'distance', label: 'Les plus près de moi' },
]

const BUDGETS = [
  { free: true, max: null, label: 'Gratuit' },
  { free: false, max: 10, label: 'Moins de 10 €' },
  { free: false, max: 20, label: 'Moins de 20 €' },
  { free: false, max: 40, label: 'Moins de 40 €' },
]

function Chip({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[14px] font-medium transition-colors',
        active ? 'border-ink bg-ink text-paper' : 'border-border-strong bg-surface text-ink hover:border-ink',
        className
      )}
    >
      {children}
    </button>
  )
}

const toggle = <T,>(list: T[] | undefined, v: T) => (list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v])

export function FilterBar({ query, basePath, locked = [], total }: FilterBarProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState<EventQuery>(query)
  const [geoError, setGeoError] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => setDraft(query), [query])

  const go = (q: EventQuery, filter?: string) => {
    // Locked filters are part of the path, never of the query string.
    const clean: EventQuery = { ...q }
    if (locked.includes('when')) clean.when = null
    if (locked.includes('categories')) clean.categories = []
    if (locked.includes('arrondissements')) clean.arrondissements = []
    if (locked.includes('free')) clean.free = false
    if (filter) track('filter', { filter })
    startTransition(() => router.push(eventsHref(clean, basePath), { scroll: false }))
  }

  const locate = (then: (coords: { lat: number; lng: number }) => void) => {
    if (!('geolocation' in navigator)) return setGeoError('Géolocalisation indisponible sur cet appareil.')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGeoError(null)
        then({ lat: p.coords.latitude, lng: p.coords.longitude })
      },
      () => setGeoError('Position refusée ou indisponible.'),
      { timeout: 8000, maximumAge: 300_000 }
    )
  }

  const nearActive = Boolean(query.near)
  // Filters fixed by the page (the "Gratuit" of /gratuit) are not the person's: not counted.
  const active = countFilters({
    ...query,
    when: locked.includes('when') ? null : query.when,
    categories: locked.includes('categories') ? [] : query.categories,
    arrondissements: locked.includes('arrondissements') ? [] : query.arrondissements,
    free: locked.includes('free') ? false : query.free,
  })

  return (
    <div className={cn('transition-opacity', pending && 'opacity-60')}>
      <div className="rail scrollbar-hide items-center py-1" role="toolbar" aria-label="Filtres rapides">
        <button
          type="button"
          onClick={() => dialog.current?.showModal()}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-ink bg-surface px-4 text-[14px] font-semibold text-ink"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Filtres{active > 0 && <span className="rounded-full bg-accent px-1.5 text-[12px] text-paper">{active}</span>}
        </button>
        {!locked.includes('when') &&
          WHEN_OPTIONS.map((w) => (
            <Chip key={w.id} active={query.when === w.id} onClick={() => go({ ...query, when: query.when === w.id ? null : w.id }, 'when')}>
              {w.label}
            </Chip>
          ))}
        {!locked.includes('free') && (
          <Chip active={Boolean(query.free)} onClick={() => go({ ...query, free: !query.free, maxPrice: null }, 'free')}>
            Gratuit
          </Chip>
        )}
        <Chip
          active={nearActive}
          onClick={() =>
            nearActive
              ? go({ ...query, near: null, sort: query.sort === 'distance' ? undefined : query.sort }, 'near')
              : locate((c) => go({ ...query, near: { ...c, radiusKm: 2.5 }, sort: 'distance' }, 'near'))
          }
        >
          <LocateFixed className="h-4 w-4" aria-hidden />
          Près de moi
        </Chip>
        {INTENTS.slice(0, 4).map((i) => (
          <Chip key={i.slug} active={Boolean(query.intents?.includes(i.slug))} onClick={() => go({ ...query, intents: toggle(query.intents, i.slug) }, 'mood')}>
            {i.label}
          </Chip>
        ))}
      </div>
      {geoError && <p className="mt-1 text-[13px] text-text-secondary">{geoError}</p>}

      <dialog
        ref={dialog}
        aria-labelledby="filters-title"
        className="m-0 mt-auto h-[88dvh] w-full max-w-none rounded-t-2xl bg-paper p-0 text-ink backdrop:bg-ink/50 sm:m-auto sm:h-auto sm:max-h-[85dvh] sm:max-w-xl sm:rounded-2xl"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close()
        }}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 id="filters-title" className="font-display text-[1.8rem]">Filtres</h2>
            <button type="button" onClick={() => dialog.current?.close()} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-hover" aria-label="Fermer les filtres">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="flex-1 space-y-7 overflow-y-auto px-4 py-5">
            {!locked.includes('when') && (
              <fieldset>
                <legend className="text-[15px] font-semibold">Quand</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[{ id: 'now', label: 'Maintenant' }, { id: 'today', label: "Aujourd'hui" }, ...WHEN_OPTIONS, { id: 'month', label: 'Ce mois-ci' }].map((w) => (
                    <Chip key={w.id} active={draft.when === w.id} onClick={() => setDraft({ ...draft, when: draft.when === w.id ? null : w.id })}>
                      {w.label}
                    </Chip>
                  ))}
                </div>
              </fieldset>
            )}

            {!locked.includes('categories') && (
              <fieldset>
                <legend className="text-[15px] font-semibold">Quoi</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => (
                    <Chip key={c.slug} active={Boolean(draft.categories?.includes(c.slug))} onClick={() => setDraft({ ...draft, categories: toggle(draft.categories, c.slug) })}>
                      {c.plural}
                    </Chip>
                  ))}
                </div>
              </fieldset>
            )}

            <fieldset>
              <legend className="text-[15px] font-semibold">Ambiance</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {INTENTS.map((i) => (
                  <Chip key={i.slug} active={Boolean(draft.intents?.includes(i.slug))} onClick={() => setDraft({ ...draft, intents: toggle(draft.intents, i.slug) })}>
                    {i.label}
                  </Chip>
                ))}
              </div>
            </fieldset>

            {!locked.includes('free') && (
              <fieldset>
                <legend className="text-[15px] font-semibold">Budget</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {BUDGETS.map((b) => {
                    const on = b.free ? Boolean(draft.free) : !draft.free && draft.maxPrice === b.max
                    return (
                      <Chip key={b.label} active={on} onClick={() => setDraft({ ...draft, free: on ? false : b.free, maxPrice: on || b.free ? null : b.max })}>
                        {b.label}
                      </Chip>
                    )
                  })}
                </div>
              </fieldset>
            )}

            {!locked.includes('arrondissements') && (
              <fieldset>
                <legend className="text-[15px] font-semibold">Quartier</legend>
                <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-10">
                  {ARRONDISSEMENTS.map((a) => {
                    const on = Boolean(draft.arrondissements?.includes(a))
                    return (
                      <button
                        key={a}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setDraft({ ...draft, arrondissements: toggle(draft.arrondissements, a) })}
                        className={cn('h-11 rounded-lg border text-[14px] font-semibold transition-colors', on ? 'border-ink bg-ink text-paper' : 'border-border-strong bg-surface hover:border-ink')}
                      >
                        {a}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            )}

            <fieldset>
              <legend className="text-[15px] font-semibold">Trier par</legend>
              <div className="mt-2 flex flex-col gap-1">
                {SORTS.filter((s) => s.id !== 'distance' || draft.near).map((s) => (
                  <label key={s.id} className="flex h-11 cursor-pointer items-center gap-3 text-[15px]">
                    <input
                      type="radio"
                      name="sort"
                      className="h-4 w-4 accent-[var(--color-accent)]"
                      checked={(draft.sort ?? (draft.near ? 'distance' : 'relevance')) === s.id}
                      onChange={() => setDraft({ ...draft, sort: s.id })}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="flex gap-2 border-t border-border px-4 py-3 safe-area-bottom">
            <button
              type="button"
              onClick={() => setDraft({ ...query, when: locked.includes('when') ? query.when : null, categories: locked.includes('categories') ? query.categories : [], arrondissements: locked.includes('arrondissements') ? query.arrondissements : [], intents: [], free: locked.includes('free') ? query.free : false, maxPrice: null, sort: undefined })}
              className="h-12 flex-1 rounded-full border border-border-strong text-[15px] font-semibold"
            >
              Tout effacer
            </button>
            <button
              type="button"
              onClick={() => {
                dialog.current?.close()
                go(draft, 'sheet')
              }}
              className="h-12 flex-[2] rounded-full bg-ink text-[15px] font-semibold text-paper"
            >
              Voir les résultats
            </button>
          </div>
        </div>
      </dialog>
      {typeof total === 'number' && (
        <p className="mt-3 text-[14px] text-text-secondary" aria-live="polite">
          {total === 0 ? 'Aucun résultat' : `${total.toLocaleString('fr-FR')} sortie${total > 1 ? 's' : ''}`}
        </p>
      )}
    </div>
  )
}
