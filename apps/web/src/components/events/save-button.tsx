'use client'

import { useState, useTransition } from 'react'
import { Bookmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import { track } from '@/lib/analytics'
import { useSavedIds } from './saved-ids'

interface SaveButtonProps {
  eventId: string
  initialSaved?: boolean
  className?: string
  /**
   * « overlay » sur une photo, « plain » dans une ligne de liste,
   * « square » dans la barre de réservation, « button » avec son libellé.
   */
  appearance?: 'overlay' | 'plain' | 'square' | 'button'
}

/** « Garder » : la sortie rejoint Mes sorties. Bascule optimiste, message en cas d'échec. */
export function SaveButton({ eventId, initialSaved, className, appearance = 'overlay' }: SaveButtonProps) {
  const known = useSavedIds()
  const [local, setLocal] = useState<boolean | null>(initialSaved ?? null)
  const [error, setError] = useState(false)
  const [isPending, startTransition] = useTransition()
  const saved = local ?? known.ids?.has(eventId) ?? false

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const previous = saved
    setLocal(!previous)
    setError(false)
    startTransition(async () => {
      try {
        const res = await fetch('/api/saves', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, saved: !previous }),
        })
        if (res.status === 401) {
          setLocal(previous)
          window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname + window.location.search)
          return
        }
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { saved: boolean }
        setLocal(data.saved)
        known.set(eventId, data.saved)
        if (data.saved) track('save', { from: appearance })
      } catch {
        setLocal(previous)
        setError(true)
      }
    })
  }

  const label = error ? 'Échec de l’enregistrement, réessayer' : saved ? 'Retirer de Mes sorties' : 'Garder dans Mes sorties'
  const icon = <Bookmark className={cn('h-5 w-5', saved && 'fill-current')} aria-hidden />

  if (appearance === 'button') {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={saved}
        className={cn(
          't-small inline-flex h-12 items-center justify-center gap-2 rounded-2xl border px-5 font-semibold transition-colors',
          saved ? 'border-accent bg-accent-soft text-accent' : 'border-border-strong text-ink hover:border-ink',
          error && 'border-error',
          className
        )}
      >
        {icon}
        {error ? 'Réessayer' : saved ? 'Gardée' : 'Garder'}
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
        'relative z-10 flex shrink-0 items-center justify-center transition-[transform,colors] active:scale-95',
        appearance === 'overlay' && 'h-11 w-11 rounded-full bg-surface-dark/55 text-ink backdrop-blur-md hover:bg-surface-dark/75',
        appearance === 'plain' && 'h-11 w-11 rounded-full text-text-secondary hover:bg-surface-hover hover:text-ink',
        appearance === 'square' && 'h-13 w-13 rounded-2xl border border-border-strong text-ink hover:border-ink',
        saved && 'text-accent',
        saved && appearance === 'overlay' && 'text-accent-glow',
        error && 'ring-2 ring-error',
        className
      )}
    >
      {icon}
    </button>
  )
}
