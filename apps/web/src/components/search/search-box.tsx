'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { Clapperboard, MapPin, Search, Tag, X } from 'lucide-react'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

interface Suggestions {
  venues: Array<{ name: string; slug: string; area: string | null }>
  categories: Array<{ label: string; href: string }>
  events: Array<{ title: string; href: string; venue: string | null }>
}

type Item = { key: string; href: string; label: string; detail: string | null; kind: 'venue' | 'category' | 'event' }

function flatten(s: Suggestions): Item[] {
  return [
    ...s.categories.map((c) => ({ key: `c-${c.href}`, href: c.href, label: c.label, detail: 'Catégorie', kind: 'category' as const })),
    ...s.venues.map((v) => ({ key: `v-${v.slug}`, href: `/lieux/${v.slug}`, label: v.name, detail: v.area, kind: 'venue' as const })),
    ...s.events.map((e) => ({ key: `e-${e.href}`, href: e.href, label: e.title, detail: e.venue, kind: 'event' as const })),
  ]
}

const ICONS = { venue: MapPin, category: Tag, event: Clapperboard }

/** Site search: words or a whole sentence ("jazz gratuit ce soir dans le 11e"), with instant suggestions. */
export function SearchBox({ initial = '', className }: { initial?: string; className?: string }) {
  const router = useRouter()
  const [q, setQ] = useState(initial)
  const [items, setItems] = useState<Item[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  const touched = useRef(false)

  // Debounced suggestions (only once the person typed: not for the initial value).
  useEffect(() => {
    if (!touched.current) return
    const v = q.trim()
    if (v.length < 2 || v.split(/\s+/).length > 4) {
      setItems([])
      return
    }
    const ac = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(v)}`, { signal: ac.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((s: Suggestions | null) => {
          if (!s) return
          setItems(flatten(s))
          setActive(-1)
          setOpen(true)
        })
        .catch(() => {})
    }, 250)
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
    if (!v) return router.push('/evenements')
    track('search', { length: v.length, words: v.split(/\s+/).length })
    router.push(`/evenements?q=${encodeURIComponent(v.slice(0, 200))}`)
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
      <label htmlFor="site-search" className="sr-only">
        Rechercher une sortie
      </label>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" aria-hidden />
      <input
        id="site-search"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        maxLength={200}
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
        placeholder="Un artiste, un lieu, ou « jazz gratuit ce soir »"
        className="h-12 w-full rounded-full border border-border-strong bg-surface pl-12 pr-12 text-[16px] text-ink placeholder:text-text-muted focus:border-ink focus:outline-none"
      />
      {q && (
        <button
          type="button"
          onClick={() => {
            setQ('')
            setItems([])
          }}
          aria-label="Effacer la recherche"
          className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-surface py-1 shadow-lg"
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
                  className={cn('flex min-h-11 items-center gap-3 px-4 py-2 text-[15px] text-ink hover:bg-surface-hover', active === i && 'bg-surface-hover')}
                >
                  <Icon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.detail && <span className="shrink-0 text-[13px] text-text-muted">{it.detail}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </form>
  )
}
