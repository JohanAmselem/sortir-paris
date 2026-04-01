'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

interface DatePickerProps {
  selectedDate: string | null // ISO date string YYYY-MM-DD
  onSelect: (date: string | null) => void
  onClose: () => void
}

export function DatePicker({ selectedDate, onSelect, onClose }: DatePickerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (selectedDate) {
      const d = new Date(selectedDate)
      return { year: d.getFullYear(), month: d.getMonth() }
    }
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const firstDay = new Date(currentMonth.year, currentMonth.month, 1)
  const lastDay = new Date(currentMonth.year, currentMonth.month + 1, 0)

  // Monday = 0, Tuesday = 1, ..., Sunday = 6
  let startOffset = firstDay.getDay() - 1
  if (startOffset < 0) startOffset = 6

  const days: (Date | null)[] = []

  // Empty slots before first day
  for (let i = 0; i < startOffset; i++) {
    days.push(null)
  }

  // Days of month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(currentMonth.year, currentMonth.month, d))
  }

  const prevMonth = () => {
    setCurrentMonth((prev) => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 }
      return { year: prev.year, month: prev.month - 1 }
    })
  }

  const nextMonth = () => {
    setCurrentMonth((prev) => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 }
      return { year: prev.year, month: prev.month + 1 }
    })
  }

  const formatISO = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()

  const isSelected = (d: Date) => selectedDate === formatISO(d)

  const isPast = (d: Date) => d < today

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 z-50 mt-2 w-[280px] rounded-2xl border border-border/60 bg-white p-4 shadow-xl animate-scale-in"
    >
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-hover transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-text-secondary" />
        </button>
        <span className="text-[13px] font-bold text-text-primary">
          {MONTHS_FR[currentMonth.month]} {currentMonth.year}
        </span>
        <button
          onClick={nextMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-hover transition-colors"
        >
          <ChevronRight className="h-4 w-4 text-text-secondary" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0">
        {DAYS_FR.map((d) => (
          <div key={d} className="py-1 text-center text-[10px] font-semibold text-text-muted uppercase">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0">
        {days.map((day, i) => {
          if (!day) {
            return <div key={`empty-${i}`} className="h-9" />
          }

          const past = isPast(day)
          const todayClass = isToday(day)
          const selected = isSelected(day)

          return (
            <button
              key={formatISO(day)}
              onClick={() => {
                if (!past) {
                  onSelect(formatISO(day))
                  onClose()
                }
              }}
              disabled={past}
              className={cn(
                'flex h-9 w-full items-center justify-center rounded-lg text-[13px] font-medium transition-all',
                past && 'text-text-muted/30 cursor-not-allowed',
                !past && !selected && 'text-text-primary hover:bg-surface-hover',
                todayClass && !selected && 'font-bold text-accent',
                selected && 'bg-accent text-white shadow-sm'
              )}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>

      {/* Clear button */}
      {selectedDate && (
        <button
          onClick={() => {
            onSelect(null)
            onClose()
          }}
          className="mt-2 w-full rounded-lg border border-border py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-hover transition-colors"
        >
          Effacer la date
        </button>
      )}
    </div>
  )
}
