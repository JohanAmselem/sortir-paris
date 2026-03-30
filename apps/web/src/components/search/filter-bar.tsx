'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const DATE_FILTERS = [
  { label: 'Ce soir', value: 'today' },
  { label: 'Ce week-end', value: 'weekend' },
  { label: 'Cette semaine', value: 'week' },
] as const

const PRICE_FILTERS = [
  { label: 'Gratuit', value: 'true' },
] as const

interface FilterBarProps {
  categories: { slug: string; name: string; icon: string | null }[]
  className?: string
}

export function FilterBar({ categories, className }: FilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const activeCategory = searchParams.get('category')
  const activeDate = searchParams.get('date')
  const activeFree = searchParams.get('free')

  const setFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null || params.get(key) === value) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    params.delete('page') // reset pagination
    router.push(`?${params.toString()}`, { scroll: false })
  }

  return (
    <div className={cn('scrollbar-hide flex gap-2 overflow-x-auto', className)}>
      {/* Date filters */}
      {DATE_FILTERS.map((filter) => (
        <button
          key={filter.value}
          onClick={() => setFilter('date', filter.value)}
          className={cn(
            'flex-shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
            activeDate === filter.value
              ? 'border-accent bg-accent text-white'
              : 'border-border bg-surface text-text-secondary hover:border-border-strong'
          )}
        >
          {filter.label}
        </button>
      ))}

      {/* Free filter */}
      {PRICE_FILTERS.map((filter) => (
        <button
          key={filter.value}
          onClick={() => setFilter('free', filter.value)}
          className={cn(
            'flex-shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
            activeFree === filter.value
              ? 'border-free bg-free text-white'
              : 'border-border bg-surface text-text-secondary hover:border-border-strong'
          )}
        >
          Gratuit
        </button>
      ))}

      {/* Separator */}
      <div className="h-8 w-px flex-shrink-0 bg-border" />

      {/* Category filters */}
      {categories.map((cat) => (
        <button
          key={cat.slug}
          onClick={() => setFilter('category', cat.slug)}
          className={cn(
            'flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
            activeCategory === cat.slug
              ? 'border-primary bg-primary text-white'
              : 'border-border bg-surface text-text-secondary hover:border-border-strong'
          )}
        >
          {cat.icon && <span>{cat.icon}</span>}
          {cat.name}
        </button>
      ))}
    </div>
  )
}
