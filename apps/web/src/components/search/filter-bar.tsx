'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const DATE_FILTERS = [
  { label: 'Ce soir', value: 'today', icon: '🌙' },
  { label: 'Ce week-end', value: 'weekend', icon: '📅' },
  { label: 'Cette semaine', value: 'week', icon: '🗓️' },
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
    params.delete('page')
    router.push(`?${params.toString()}`, { scroll: false })
  }

  return (
    <div className={cn('scrollbar-hide flex items-center gap-1.5 overflow-x-auto py-0.5', className)}>
      {/* Date filters */}
      {DATE_FILTERS.map((filter) => (
        <button
          key={filter.value}
          onClick={() => setFilter('date', filter.value)}
          className={cn(
            'flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-all',
            activeDate === filter.value
              ? 'border-accent bg-accent text-white shadow-sm'
              : 'border-border bg-surface text-text-secondary hover:bg-surface-hover hover:border-border-strong'
          )}
        >
          <span className="text-sm">{filter.icon}</span>
          {filter.label}
        </button>
      ))}

      {/* Free filter */}
      <button
        onClick={() => setFilter('free', 'true')}
        className={cn(
          'flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-all',
          activeFree === 'true'
            ? 'border-free bg-free text-white shadow-sm'
            : 'border-border bg-surface text-text-secondary hover:bg-surface-hover hover:border-border-strong'
        )}
      >
        <span className="text-sm">🆓</span>
        Gratuit
      </button>

      {/* Separator */}
      <div className="mx-0.5 h-6 w-px flex-shrink-0 bg-border" />

      {/* Category filters */}
      {categories.map((cat) => (
        <button
          key={cat.slug}
          onClick={() => setFilter('category', cat.slug)}
          className={cn(
            'flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-all',
            activeCategory === cat.slug
              ? 'border-primary bg-primary text-white shadow-sm'
              : 'border-border bg-surface text-text-secondary hover:bg-surface-hover hover:border-border-strong'
          )}
        >
          {cat.icon && <span className="text-sm">{cat.icon}</span>}
          {cat.name}
        </button>
      ))}
    </div>
  )
}
