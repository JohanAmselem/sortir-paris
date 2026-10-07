'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StarRatingProps {
  value: number
  onChange?: (value: number) => void
  readonly?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /** Accessible name of the interactive group. */
  label?: string
}

const SIZES = { sm: 'h-3.5 w-3.5', md: 'h-5 w-5', lg: 'h-7 w-7' }
const LABELS = ['Pas aimé', 'Bof', 'Bien', 'Très bien', 'Adoré']

/**
 * Read-only: a single image with an accessible label.
 * Interactive: a radiogroup of 5 buttons (≥ 44px targets with size="lg"),
 * arrow keys supported.
 */
export function StarRating({ value, onChange, readonly = false, size = 'md', className, label = 'Ta note' }: StarRatingProps) {
  const [hover, setHover] = useState(0)
  const shown = hover || value

  if (readonly || !onChange) {
    return (
      <span className={cn('inline-flex items-center gap-0.5', className)} role="img" aria-label={`${value} sur 5`}>
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            aria-hidden
            className={cn(SIZES[size], s <= Math.round(value) ? 'fill-warning text-warning' : 'fill-transparent text-border-strong')}
          />
        ))}
      </span>
    )
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      onChange(Math.min(5, (value || 0) + 1))
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      onChange(Math.max(1, (value || 1) - 1))
    }
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div role="radiogroup" aria-label={label} className="flex items-center" onKeyDown={onKeyDown} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={value === s}
            aria-label={`${s} sur 5 · ${LABELS[s - 1]}`}
            tabIndex={value === s || (!value && s === 1) ? 0 : -1}
            onClick={() => onChange(s)}
            onMouseEnter={() => setHover(s)}
            className="flex h-11 w-11 items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-95"
          >
            <Star
              aria-hidden
              className={cn(SIZES[size], s <= shown ? 'fill-warning text-warning' : 'fill-transparent text-text-muted')}
            />
          </button>
        ))}
      </div>
      <span className="min-h-[1.25rem] text-[13px] font-medium text-text-secondary" aria-hidden>
        {shown ? LABELS[shown - 1] : ''}
      </span>
    </div>
  )
}
