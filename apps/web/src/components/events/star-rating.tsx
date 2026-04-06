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
}

export function StarRating({ value, onChange, readonly = false, size = 'md', className }: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState(0)

  const sizes = {
    sm: 'h-3.5 w-3.5',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  }

  const gaps = {
    sm: 'gap-0.5',
    md: 'gap-0.5',
    lg: 'gap-1',
  }

  return (
    <div className={cn('flex items-center', gaps[size], className)}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= (hoverValue || value)
        return (
          <button
            key={star}
            type="button"
            disabled={readonly}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => !readonly && setHoverValue(star)}
            onMouseLeave={() => !readonly && setHoverValue(0)}
            className={cn(
              'transition-all duration-150',
              readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110 active:scale-95'
            )}
          >
            <Star
              className={cn(
                sizes[size],
                'transition-colors',
                filled
                  ? 'fill-amber-400 text-amber-400'
                  : readonly
                    ? 'fill-transparent text-border-strong'
                    : 'fill-transparent text-text-muted hover:text-amber-300'
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
