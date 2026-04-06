'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

interface SurpriseFiltersProps {
  categories: { slug: string; name: string; icon: string | null }[]
  activeCategory?: string
  activeFree: boolean
  activeTonight: boolean
}

export function SurpriseFilters({ categories, activeCategory, activeFree, activeTonight }: SurpriseFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const toggle = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (params.get(key) === value) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    router.push(`/surprise?${params.toString()}`)
  }

  return (
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      <button
        onClick={() => toggle('tonight', '1')}
        className={cn(
          'rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all',
          activeTonight
            ? 'border-accent bg-accent text-white'
            : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
        )}
      >
        🌙 Ce soir
      </button>
      <button
        onClick={() => toggle('free', '1')}
        className={cn(
          'rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all',
          activeFree
            ? 'border-free bg-free text-white'
            : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
        )}
      >
        🆓 Gratuit
      </button>
      {categories.map((cat) => (
        <button
          key={cat.slug}
          onClick={() => toggle('category', cat.slug)}
          className={cn(
            'rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all',
            activeCategory === cat.slug
              ? 'border-primary bg-primary text-white'
              : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
          )}
        >
          {cat.icon} {cat.name}
        </button>
      ))}
    </div>
  )
}
