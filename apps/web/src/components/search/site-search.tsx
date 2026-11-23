'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { MapPin, Mic2, Search, Tag, Ticket, X } from 'lucide-react'
import { track } from '@/lib/analytics'
import { suggestionItems, type SearchItem as Item, type SearchSuggestions as Suggestions } from '@/lib/search-suggestions'
import { cn } from '@/lib/utils'

const ICONS = { artist: Mic2, venue: MapPin, category: Tag, event: Ticket }

interface SiteSearchProps {
  initial?: string
  className?: string
  /** Champ plus haut (accueil, Agenda). */
  size?: 'md' | 'lg'
  autoFocus?: boolean
  id?: string
}

/**
 * LA recherche du site, sans IA : artistes, lieux et sorties proposés pendant la
 * frappe, et la validation ouvre l'Agenda (`/agenda?q=`), qui comprend les dates
 * (« Angèle en mars », « jazz samedi »).
 */
export function SiteSearch({ initial = '', className, size = 'md', autoFocus, id }: SiteSearchProps) {
  const router = useRouter()
  const [q, setQ] = useState(initial)
  const [items, setItems] = useState<Item[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const autoId = useId()
  const inputId = id ?? `recherche-${autoId}`
  const listId = `${inputId}-liste`
  const touched = useRef(false)

  useEffect(() => {
    if (!touched.current) return
    const v = q.trim()
    if (v.length < 2) {
      setItems([])
      return
    }
    const ac = new AbortController()
    const t = setTimeout(() => {
      const get = <T,>(url: string, fallback: T) =>
        fetch(url, { signal: ac.signal })
          .then((r) => (r.ok ? (r.json() as Promise<T>) : fallback))
          .catch(() => fallback)
      Promise.all([
        get<{ artists: Array<{ key: string; name: string; dates: number }> }>(`/api/artists/suggest?q=${encodeURIComponent(v)}`, { artists: [] }),
        get<Suggestions>(`/api/suggest?q=${encodeURIComponent(v)}`, { venues: [], categories: [], events: [] }),
      ]).then(([a, s]) => {
        if (ac.signal.aborted) return
        setItems(suggestionItems(a.artists ?? [], s))
        setActive(-1)
        setOpen(true)
      })
    }, 220)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
  }, [q])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (open && active >= 0 && items[active]) {
      track('search_suggest', { kind: items[active].kind })
      setOpen(false)
      return router.push(items[active].href)
    }
    const v = q.trim()
    setOpen(false)
    if (!v) return router.push('/agenda')
    track('search', { length: v.length, words: v.split(/\s+/).length })
    router.push(`/agenda?q=${encodeURIComponent(v.slice(0, 120))}`)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !items.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1))
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && items.length > 0

  return (
    <form
      role="search"
      onSubmit={submit}
      className={cn('relative', className)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        Rechercher un artiste, un lieu, une sortie
      </label>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" aria-hidden />
      <input
        id={inputId}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoFocus={autoFocus}
        maxLength={120}
        value={q}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          touched.current = true
          setQ(e.target.value)
        }}
        onFocus={() => items.length && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Un artiste, un lieu, une envie…"
        className={cn(
          't-body w-full rounded-2xl border border-border-strong bg-field pl-12 pr-12 text-ink placeholder:text-text-muted focus:border-accent focus:outline-none',
          size === 'lg' ? 'h-13' : 'h-11'
        )}
      />
      {q && (
        <button
          type="button"
          onClick={() => {
            setQ('')
            setItems([])
          }}
          aria-label="Effacer la recherche"
          className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-50 max-h-[60vh] overflow-y-auto rounded-2xl border border-border-strong bg-surface py-1 shadow-xl"
        >
          {items.map((it, i) => {
            const Icon = ICONS[it.kind]
            return (
              <li key={it.key} id={`${listId}-${i}`} role="option" aria-selected={active === i}>
                <Link
                  href={it.href}
                  onClick={() => {
                    track('search_suggest', { kind: it.kind })
                    setOpen(false)
                  }}
                  className={cn('t-body flex min-h-11 items-center gap-3 px-4 py-2 text-ink hover:bg-surface-hover', active === i && 'bg-surface-hover')}
                >
                  <Icon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.detail && <span className="t-small shrink-0 text-text-muted">{it.detail}</span>}
                </Link>
              </li>
            )
          })}
          <li role="option" aria-selected={false}>
            <Link
              href={`/agenda?q=${encodeURIComponent(q.trim())}`}
              onClick={() => setOpen(false)}
              className="t-small flex min-h-11 items-center gap-3 border-t border-border px-4 py-2 font-semibold text-accent hover:bg-surface-hover"
            >
              <Search className="h-4 w-4 shrink-0" aria-hidden />
              Tout l’agenda pour « {q.trim()} »
            </Link>
          </li>
        </ul>
      )}
    </form>
  )
}
