'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ArrowRight, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

const EXAMPLE_QUERIES = [
  'Jazz gratuit ce soir',
  'Expo photo ce week-end',
  'Spectacle pour enfants',
  'Théâtre dans le 10e',
  'Festival en plein air',
  'Visite guidée dimanche',
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
      {/* Search input */}
      <div
        className={cn(
          'relative rounded-2xl border bg-white/10 backdrop-blur-md transition-all duration-300',
          isFocused
            ? 'border-white/30 shadow-2xl shadow-accent/20'
            : 'border-white/15 shadow-xl hover:border-white/25'
        )}
      >
        {/* AI indicator */}
        <div className="absolute -top-2.5 left-4 z-10">
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-widest shadow-lg shadow-accent/30">
            <Sparkles className="h-2.5 w-2.5" />
            IA
          </span>
        </div>

        <form onSubmit={handleSubmit} className="p-1.5 pt-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Décris ta sortie idéale..."
                className={cn(
                  'w-full rounded-xl bg-transparent py-3 pl-10 pr-3',
                  'text-[15px] text-white placeholder:text-white/40',
                  'focus:outline-none'
                )}
              />
            </div>
            <button
              type="submit"
              disabled={!query.trim() || isSubmitting}
              className={cn(
                'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-all duration-200',
                query.trim()
                  ? 'bg-accent text-white shadow-lg shadow-accent/30 hover:bg-accent-hover active:scale-95'
                  : 'bg-white/10 text-white/30 cursor-not-allowed'
              )}
            >
              {isSubmitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Example queries */}
      <div className="mt-4">
        <div className="flex flex-wrap justify-center gap-1.5">
          {EXAMPLE_QUERIES.slice(0, 4).map((example) => (
            <button
              key={example}
              onClick={() => handleExampleClick(example)}
              className={cn(
                'rounded-full border border-white/10 bg-white/5 px-3 py-1',
                'text-[11px] font-medium text-white/50',
                'transition-all duration-200',
                'hover:border-white/20 hover:bg-white/10 hover:text-white/80',
                'active:scale-95'
              )}
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
