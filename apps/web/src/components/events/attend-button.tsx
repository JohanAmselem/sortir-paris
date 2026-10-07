'use client'

import { useEffect, useState, useTransition } from 'react'
import { Loader2, UserCheck, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AttendButtonProps {
  eventId: string
  className?: string
}

/**
 * « J'y vais ». Closed (hidden) once the event ended more than a day ago;
 * the server enforces the same rule. XP is granted once and removed on undo.
 */
export function AttendButton({ eventId, className }: AttendButtonProps) {
  const [attending, setAttending] = useState(false)
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/attendance?eventId=${encodeURIComponent(eventId)}`, { signal: ctrl.signal, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count: number; isAttending: boolean; open: boolean } | null) => {
        if (d) {
          setCount(d.count)
          setAttending(d.isAttending)
          setOpen(d.open)
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
    return () => ctrl.abort()
  }, [eventId])

  const toggle = () => {
    const previous = attending
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, attending: !previous }),
        })
        if (res.status === 401) {
          window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname)
          return
        }
        const data = (await res.json().catch(() => ({}))) as { attending?: boolean; error?: string }
        if (!res.ok) {
          setError(data.error ?? 'Échec, réessaie.')
          if (res.status === 409) setOpen(false)
          return
        }
        const now = Boolean(data.attending)
        setAttending(now)
        if (now !== previous) setCount((c) => Math.max(0, c + (now ? 1 : -1)))
      } catch {
        setError('Connexion perdue, réessaie.')
      }
    })
  }

  if (!loaded) return <div className={cn('h-11', className)} aria-hidden />
  if (!open && !attending) {
    return count > 0 ? (
      <p className={cn('text-[13px] text-text-secondary', className)}>
        {count} membre{count > 1 ? 's y sont allés' : ' y est allé'}
      </p>
    ) : null
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={attending}
        className={cn(
          'inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-[14px] font-semibold transition-colors',
          attending ? 'border-accent bg-accent-soft text-accent' : 'border-border-strong bg-surface text-ink hover:border-ink'
        )}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : attending ? (
          <UserCheck className="h-4 w-4" aria-hidden />
        ) : (
          <Users className="h-4 w-4" aria-hidden />
        )}
        {attending ? 'J’y vais' : 'J’y vais ?'}
        <span className="sr-only">{attending ? ', cliquer pour annuler' : ''}</span>
      </button>
      {count > 0 && (
        <p className="text-[13px] text-text-secondary">
          {count} membre{count > 1 ? 's y vont' : ' y va'}
        </p>
      )}
      {error && (
        <p className="text-[13px] font-medium text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
