'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Sparkles, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchResult {
  id: string
  title: string
  slug: string
  category?: string | null
  categorySlug?: string | null
  venueName?: string | null
}

const CATEGORY_EMOJI: Record<string, string> = {
  Concert: '🎵', Concerts: '🎵',
  Exposition: '🎨', Expos: '🎨',
  'Théâtre': '🎭', Theatre: '🎭',
  'Cinéma': '🎬', Cinema: '🎬',
  Festival: '🎪', Festivals: '🎪',
  Danse: '💃',
  Spectacle: '🎪', Spectacles: '🎪',
  Atelier: '🛠️', Ateliers: '🛠️',
  Visite: '🏛️', Visites: '🏛️',
  Sport: '⚽',
  'Conférence': '🎤', Conference: '🎤',
}

// Curated smart suggestions shown when input is focused but empty
const SMART_SUGGESTIONS = [
  { label: 'Concerts ce soir', query: 'concerts ce soir', icon: '🎵' },
  { label: 'Expos gratuites', query: 'expositions gratuites', icon: '🎨' },
  { label: 'Sorties en famille', query: 'sorties en famille ce weekend', icon: '👨‍👩‍👧' },
  { label: 'Stand-up & humour', query: 'stand-up humour ce soir', icon: '😂' },
  { label: 'Soirée originale', query: 'soirée originale insolite', icon: '✨' },
]

// AI search activates at 8 chars (natural language threshold)
const AI_QUERY_THRESHOLD = 8

export function SearchBar({ className }: { className?: string }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const isAIQuery = query.trim().length >= AI_QUERY_THRESHOLD

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard shortcut "/" to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
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

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    const q = query.trim()
    if (q) {
      // AI search for all queries >= 8 chars
      if (q.length >= AI_QUERY_THRESHOLD) {
        router.push(`/evenements?q=${encodeURIComponent(q)}&ai=1`)
      } else {
        router.push(`/evenements?q=${encodeURIComponent(q)}`)
      }
      setIsOpen(false)
      setShowSuggestions(false)
    }
  }

  const handleSuggestionClick = (suggestionQuery: string) => {
    router.push(`/evenements?q=${encodeURIComponent(suggestionQuery)}&ai=1`)
    setIsOpen(false)
    setShowSuggestions(false)
    setQuery(suggestionQuery)
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
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
              setShowSuggestions(false)
            }}
            onFocus={() => {
              if (query.length === 0) setShowSuggestions(true)
              else setIsOpen(true)
            }}
            placeholder="Concert jazz ce soir, expo gratuite, sortie en famille..."
            className={cn(
              'w-full rounded-xl border border-border bg-surface py-2.5 pl-10',
              isAIQuery ? 'pr-36' : 'pr-10',
              'text-sm text-text-primary placeholder:text-text-muted',
              'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20',
              'transition-all duration-150'
            )}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {isLoading && !isAIQuery && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            )}
            {isAIQuery && (
              <button
                type="submit"
                className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white transition-all hover:bg-accent/90 hover:shadow-md active:scale-95"
              >
                <Sparkles className="h-3 w-3" />
                Recherche IA
              </button>
            )}
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setResults([])
                  setShowSuggestions(true)
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

      {/* Smart suggestions (empty state) */}
      {showSuggestions && query.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-surface shadow-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-border/50">
            <p className="text-xs font-medium text-text-muted flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-accent" />
              Recherches populaires
            </p>
          </div>
          {SMART_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.query}
              onClick={() => handleSuggestionClick(suggestion.query)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-hover transition-colors"
            >
              <span className="text-base">{suggestion.icon}</span>
              <span className="flex-1 text-sm text-text-primary">{suggestion.label}</span>
              <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
            </button>
          ))}
        </div>
      )}

      {/* AI mode hint */}
      {query.trim().length >= 3 && query.trim().length < AI_QUERY_THRESHOLD && !results.length && !isLoading && (
        <div className="absolute z-40 mt-1 w-full rounded-xl border border-border/50 bg-surface/90 px-4 py-2.5 text-xs text-text-muted backdrop-blur-sm shadow-sm">
          <Sparkles className="mr-1 inline h-3 w-3 text-accent" />
          Continue à taper pour activer la recherche IA intelligente
        </div>
      )}

      {/* Autocomplete dropdown */}
      {isOpen && results.length > 0 && !isAIQuery && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-surface shadow-lg overflow-hidden">
          {results.map((result) => (
            <button
              key={result.id}
              onClick={() => {
                router.push(`/evenements/${result.slug}`)
                setIsOpen(false)
                setQuery('')
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover transition-colors"
            >
              <span className="text-sm">
                {CATEGORY_EMOJI[result.category ?? result.categorySlug ?? ''] || '📌'}
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
            onClick={() => handleSubmit()}
            className="w-full border-t border-border px-4 py-2.5 text-center text-sm font-medium text-accent hover:bg-surface-hover transition-colors flex items-center justify-center gap-1.5"
          >
            <Search className="h-3.5 w-3.5" />
            Voir tous les résultats pour &quot;{query}&quot;
          </button>
        </div>
      )}
    </div>
  )
}
