'use client'

import { useState, useTransition } from 'react'
import { Bookmark } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SaveButtonProps {
  eventId: string
  initialSaved?: boolean
  className?: string
}

export function SaveButton({ eventId, initialSaved = false, className }: SaveButtonProps) {
  const [saved, setSaved] = useState(initialSaved)
  const [isPending, startTransition] = useTransition()

  const toggle = () => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/saves', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId }),
        })

        if (res.status === 401) {
          // Redirect to login
          window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname)
          return
        }

        const data = await res.json()
        setSaved(data.saved)
      } catch {
        // Revert on error
        setSaved((prev) => !prev)
      }
    })
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      aria-label={saved ? 'Retirer des sauvegardes' : 'Sauvegarder'}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-full bg-white/80 backdrop-blur-sm',
        'transition-all duration-200 hover:bg-white',
        saved && 'animate-bounce-sm',
        className
      )}
    >
      <Bookmark
        className={cn(
          'h-4 w-4 transition-colors',
          saved ? 'fill-accent text-accent' : 'text-text-secondary'
        )}
      />
    </button>
  )
}
