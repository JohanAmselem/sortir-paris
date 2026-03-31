'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchResult {
  id: string
  title: string
  slug: string
  category: string | null
  venueName: string | null
}

const AI_QUERY_THRESHOLD = 15

export function SearchBar({ className }: { className?: string }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const isAIQuery = query.trim().length >= AI_QUERY_THRESHOLD

  useEffect(() => {
    // Only do autocomplete for short queries
    if (query.length < 2 || isAIQuery) {
      setResults([])
      return
    }

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/events/search?q=${encodeURIComponent(query)}&limit=5`)
        const data = await res.json()
        setResults(data.data ?? [])
      } catch {
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }, 250)

    return () => clearTimeout(debounceRef.current)
  }, [query, isAIQuery])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      if (isAIQuery) {
        router.push(`/evenements?q=${encodeURIComponent(query.trim())}&ai=1`)
      } else {
        router.push(`/evenements?q=${encodeURIComponent(query.trim())}`)
      }
      setIsOpen(false)
    }
  }

  return (
    <div className={cn('relative', className)}>
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="Rechercher un événement, lieu..."
            className={cn(
              'w-full rounded-lg border border-border bg-surface py-2.5 pl-10',
              isAIQuery ? 'pr-32' : 'pr-10',
              'text-sm text-text-primary placeholder:text-text-muted',
              'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20',
              'transition-all duration-150'
            )}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {isAIQuery && (
              <button
                type="submit"
                className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent/90"
              >
                <Sparkles className="h-3 w-3" />
                Recherche IA
              </button>
            )}
            {query && !isAIQuery && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setResults([])
                  inputRef.current?.focus()
                }}
                className="text-text-muted hover:text-text-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </form>

      {/* AI hint for medium-length queries */}
      {query.trim().length >= 8 && !isAIQuery && (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-border/50 bg-surface/80 px-4 py-2 text-xs text-text-muted backdrop-blur-sm">
          <Sparkles className="mr-1 inline h-3 w-3 text-accent" />
          Tapez une phrase plus longue pour activer la recherche IA
        </div>
      )}

      {/* Autocomplete dropdown */}
      {isOpen && results.length > 0 && !isAIQuery && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg">
          {results.map((result) => (
            <button
              key={result.id}
              onClick={() => {
                router.push(`/evenements/${result.slug}`)
                setIsOpen(false)
                setQuery('')
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover transition-colors first:rounded-t-lg last:rounded-b-lg"
            >
              <span className="text-sm text-text-muted">
                {result.category === 'Concert' ? '🎵' : result.category === 'Exposition' ? '🎨' : '🎭'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{result.title}</p>
                {result.venueName && (
                  <p className="truncate text-xs text-text-muted">{result.venueName}</p>
                )}
              </div>
            </button>
          ))}
          <button
            onClick={handleSubmit}
            className="w-full border-t border-border px-4 py-2.5 text-center text-sm font-medium text-accent hover:bg-surface-hover transition-colors rounded-b-lg"
          >
            Voir tous les résultats pour &quot;{query}&quot;
          </button>
        </div>
      )}
    </div>
  )
}
