'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Search, X } from 'lucide-react'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

/** Site search: words or a whole sentence ("jazz gratuit ce soir dans le 11e"). */
export function SearchBox({ initial = '', className }: { initial?: string; className?: string }) {
  const router = useRouter()
  const [q, setQ] = useState(initial)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = q.trim()
    if (!v) return router.push('/evenements')
    track('search', { length: v.length, words: v.split(/\s+/).length })
    router.push(`/evenements?q=${encodeURIComponent(v.slice(0, 200))}`)
  }

  return (
    <form role="search" onSubmit={submit} className={cn('relative', className)}>
      <label htmlFor="site-search" className="sr-only">
        Rechercher une sortie
      </label>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" aria-hidden />
      <input
        id="site-search"
        type="search"
        enterKeyHint="search"
        maxLength={200}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Un artiste, un lieu, ou « jazz gratuit ce soir »"
        className="h-12 w-full rounded-full border border-border-strong bg-surface pl-12 pr-12 text-[16px] text-ink placeholder:text-text-muted focus:border-ink focus:outline-none"
      />
      {q && (
        <button
          type="button"
          onClick={() => setQ('')}
          aria-label="Effacer la recherche"
          className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </form>
  )
}
