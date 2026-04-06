'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { DatePicker } from './date-picker'
import { NearMeButton } from '@/components/ui/near-me-button'

const DATE_FILTERS = [
  { label: 'Ce soir', value: 'today', icon: '🌙' },
  { label: 'Ce week-end', value: 'weekend', icon: '📅' },
  { label: 'Cette semaine', value: 'week', icon: '🗓️' },
] as const

const MONTHS_SHORT = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
]

const ARRONDISSEMENTS = [
  '1er', '2e', '3e', '4e', '5e', '6e', '7e', '8e', '9e', '10e',
  '11e', '12e', '13e', '14e', '15e', '16e', '17e', '18e', '19e', '20e',
] as const

const AMBIANCE_FILTERS = [
  { value: 'romantique', label: 'Sortie à deux', icon: '💕' },
  { value: 'festif', label: 'Entre potes', icon: '🎉' },
  { value: 'chill', label: 'Chill', icon: '😌' },
  { value: 'familial', label: 'En famille', icon: '👨‍👩‍👧' },
  { value: 'culturel', label: 'Culturel', icon: '📚' },
] as const

interface FilterBarProps {
  categories: { slug: string; name: string; icon: string | null }[]
  className?: string
}

export function FilterBar({ categories, className }: FilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showDatePicker, setShowDatePicker] = useState(false)

  const activeCategory = searchParams.get('category')
  const activeDate = searchParams.get('date')
  const activeFree = searchParams.get('free')
  const activeArr = searchParams.get('arr')
  const activeAmbiance = searchParams.get('ambiance')
  const [showArrDropdown, setShowArrDropdown] = useState(false)

  // Check if activeDate is an ISO date (YYYY-MM-DD)
  const isISODate = activeDate && /^\d{4}-\d{2}-\d{2}$/.test(activeDate)

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

  const formatSelectedDate = (isoDate: string): string => {
    const d = new Date(isoDate + 'T00:00:00')
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
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

      {/* Date picker button */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setShowDatePicker(!showDatePicker)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-all',
            isISODate
              ? 'border-accent bg-accent text-white shadow-sm'
              : 'border-border bg-surface text-text-secondary hover:bg-surface-hover hover:border-border-strong'
          )}
        >
          <span className="text-sm">📆</span>
          {isISODate ? formatSelectedDate(activeDate!) : 'Date...'}
        </button>

        {showDatePicker && (
          <DatePicker
            selectedDate={isISODate ? activeDate : null}
            onSelect={(date) => setFilter('date', date)}
            onClose={() => setShowDatePicker(false)}
          />
        )}
      </div>

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

      {/* Near me */}
      <NearMeButton />

      {/* Arrondissement filter */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setShowArrDropdown(!showArrDropdown)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-all',
            activeArr
              ? 'border-neon bg-neon text-white shadow-sm'
              : 'border-border bg-surface text-text-secondary hover:bg-surface-hover hover:border-border-strong'
          )}
        >
          <span className="text-sm">📍</span>
          {activeArr ? `${activeArr} arr.` : 'Quartier'}
        </button>

        {showArrDropdown && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowArrDropdown(false)} />
            <div className="absolute top-full left-0 z-50 mt-1 max-h-60 w-48 overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-xl">
              {activeArr && (
                <button
                  onClick={() => { setFilter('arr', null); setShowArrDropdown(false) }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-accent hover:bg-surface-hover"
                >
                  Tous les quartiers
                </button>
              )}
              <div className="grid grid-cols-2 gap-0.5">
                {ARRONDISSEMENTS.map((arr) => (
                  <button
                    key={arr}
                    onClick={() => { setFilter('arr', arr); setShowArrDropdown(false) }}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all text-center',
                      activeArr === arr
                        ? 'bg-neon text-white'
                        : 'text-text-secondary hover:bg-surface-hover'
                    )}
                  >
                    {arr}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

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

      {/* Separator */}
      <div className="mx-0.5 h-6 w-px flex-shrink-0 bg-border" />

      {/* Ambiance filters */}
      {AMBIANCE_FILTERS.map((amb) => (
        <button
          key={amb.value}
          onClick={() => setFilter('ambiance', amb.value)}
          className={cn(
            'flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-all',
            activeAmbiance === amb.value
              ? 'border-purple-500 bg-purple-500 text-white shadow-sm'
              : 'border-border bg-surface text-text-secondary hover:bg-surface-hover hover:border-border-strong'
          )}
        >
          <span className="text-sm">{amb.icon}</span>
          {amb.label}
        </button>
      ))}
    </div>
  )
}
