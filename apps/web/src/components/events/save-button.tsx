'use client'

import { useState, useTransition } from 'react'
import { Bookmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import { track } from '@/lib/analytics'

interface SaveButtonProps {
  eventId: string
  initialSaved?: boolean
  className?: string
  /** "icon" on images, "button" with label on the event page. */
  appearance?: 'icon' | 'button'
}

export function SaveButton({ eventId, initialSaved = false, className, appearance = 'icon' }: SaveButtonProps) {
  const [saved, setSaved] = useState(initialSaved)
  const [error, setError] = useState(false)
  const [isPending, startTransition] = useTransition()

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const previous = saved
    setSaved(!previous) // optimistic
    setError(false)
    startTransition(async () => {
      try {
        const res = await fetch('/api/saves', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId }),
        })
        if (res.status === 401) {
          setSaved(previous)
          window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname)
          return
        }
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { saved: boolean }
        setSaved(data.saved)
        if (data.saved) track('save', { from: appearance })
      } catch {
        setSaved(previous)
        setError(true)
      }
    })
  }

  const label = error ? 'Échec, réessayer' : saved ? 'Retirer de mes sorties' : 'Garder pour plus tard'

  if (appearance === 'button') {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={saved}
        className={cn(
          'inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-[14px] font-semibold transition-colors',
          saved ? 'border-accent bg-accent-soft text-accent' : 'border-border-strong bg-surface text-ink hover:border-ink',
          className
        )}
      >
        <Bookmark className={cn('h-4 w-4', saved && 'fill-current')} aria-hidden />
        {saved ? 'Gardé' : 'Garder'}
        <span className="sr-only">{label}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-pressed={saved}
      aria-label={label}
      title={label}
      className={cn(
        'relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-surface/90 shadow-sm transition-transform active:scale-95',
        saved && 'animate-bounce-sm',
        error && 'ring-2 ring-neon',
        className
      )}
    >
      <Bookmark className={cn('h-[18px] w-[18px]', saved ? 'fill-accent text-accent' : 'text-ink')} aria-hidden />
    </button>
  )
}
