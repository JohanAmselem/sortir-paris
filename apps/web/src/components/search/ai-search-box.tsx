'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ArrowRight, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

const EXAMPLE_QUERIES = [
  'Concert de jazz gratuit ce soir',
  'Expo photo dans le Marais ce week-end',
  'Spectacle pour enfants samedi',
  'Théâtre comique près du 10e',
  'Festival électro en plein air',
  'Visite guidée gratuite dimanche',
]

export function AISearchBox({ className }: { className?: string }) {
  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!query.trim() || isSubmitting) return
    setIsSubmitting(true)
    router.push(`/evenements?q=${encodeURIComponent(query.trim())}&ai=1`)
  }

  const handleExampleClick = (example: string) => {
    setQuery(example)
    setIsSubmitting(true)
    router.push(`/evenements?q=${encodeURIComponent(example)}&ai=1`)
  }

  return (
    <div className={cn('w-full', className)}>
      {/* Main search area */}
      <div
        className={cn(
          'relative rounded-2xl border-2 bg-surface transition-all duration-300',
          isFocused
            ? 'border-accent shadow-xl shadow-accent/10'
            : 'border-border shadow-lg hover:border-accent/40 hover:shadow-xl'
        )}
      >
        {/* AI Badge */}
        <div className="absolute -top-3 left-4 z-10">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-white uppercase tracking-wider shadow-md">
            <Sparkles className="h-3 w-3" />
            Recherche IA
          </span>
        </div>

        <form onSubmit={handleSubmit} className="p-1.5 pt-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Décris ta sortie idéale..."
                className={cn(
                  'w-full rounded-xl bg-transparent py-3.5 pl-12 pr-4',
                  'text-base text-text-primary placeholder:text-text-muted',
                  'focus:outline-none',
                  'md:text-lg'
                )}
              />
            </div>
            <button
              type="submit"
              disabled={!query.trim() || isSubmitting}
              className={cn(
                'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl transition-all duration-200',
                query.trim()
                  ? 'bg-accent text-white shadow-md hover:bg-accent-hover hover:shadow-lg active:scale-95'
                  : 'bg-surface-hover text-text-muted cursor-not-allowed'
              )}
            >
              {isSubmitting ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <ArrowRight className="h-5 w-5" />
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Example queries */}
      <div className="mt-4">
        <p className="text-center text-xs font-medium text-white/50 mb-2.5">
          Essayez par exemple :
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {EXAMPLE_QUERIES.slice(0, 4).map((example) => (
            <button
              key={example}
              onClick={() => handleExampleClick(example)}
              className={cn(
                'rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5',
                'text-xs font-medium text-white/70',
                'transition-all duration-200 backdrop-blur-sm',
                'hover:border-accent/50 hover:bg-accent/20 hover:text-white',
                'active:scale-95'
              )}
            >
              &ldquo;{example}&rdquo;
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
