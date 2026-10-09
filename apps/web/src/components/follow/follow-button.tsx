'use client'

import { useEffect, useState, useTransition } from 'react'
import { Bell, BellRing } from 'lucide-react'
import { cn } from '@/lib/utils'
import { track } from '@/lib/analytics'

export type FollowTarget = { kind: 'venue'; venueId: string } | { kind: 'artist'; term: string; label: string }

interface FollowButtonProps {
  target: FollowTarget
  /** Shown in the button: "Suivre ce lieu", "Suivre « Cyrano »". */
  label: string
  className?: string
}

function query(t: FollowTarget): string {
  return t.kind === 'venue' ? `venueId=${encodeURIComponent(t.venueId)}` : `term=${encodeURIComponent(t.term)}`
}

/**
 * Follow a venue or an artist / work: its new dates show up in « Nouveautés
 * pour toi » (compte, Club). Optimistic toggle; visitors go to the login page.
 */
export function FollowButton({ target, label, className }: FollowButtonProps) {
  const [following, setFollowing] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const key = query(target)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/follows?${key}`, { signal: ctrl.signal, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { following?: boolean } | null) => {
        if (d) setFollowing(Boolean(d.following))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
    return () => ctrl.abort()
  }, [key])

  const toggle = () => {
    const previous = following
    setFollowing(!previous) // optimistic
    setError(null)
    startTransition(async () => {
      try {
        const body = target.kind === 'venue' ? { kind: 'venue', venueId: target.venueId } : { kind: 'artist', term: target.term, label: target.label }
        const res = await fetch('/api/follows', {
          method: previous ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.status === 401) {
          setFollowing(previous)
          window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname)
          return
        }
        const data = (await res.json().catch(() => ({}))) as { following?: boolean; error?: string }
        if (!res.ok) {
          setFollowing(previous)
          setError(data.error ?? 'Échec, réessaie.')
          return
        }
        setFollowing(Boolean(data.following))
        if (data.following) track('follow', { kind: target.kind })
      } catch {
        setFollowing(previous)
        setError('Connexion perdue, réessaie.')
      }
    })
  }

  if (!loaded) return <div className={cn('h-11', className)} aria-hidden />

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={following}
        className={cn(
          'inline-flex h-11 max-w-full items-center justify-center gap-2 rounded-full border px-4 text-[14px] font-semibold transition-colors',
          following ? 'border-accent bg-accent-soft text-accent' : 'border-border-strong bg-surface text-ink hover:border-ink'
        )}
      >
        {following ? <BellRing className="h-4 w-4 shrink-0" aria-hidden /> : <Bell className="h-4 w-4 shrink-0" aria-hidden />}
        <span className="truncate">{following ? 'Suivi' : label}</span>
        <span className="sr-only">{following ? ` : ${label.replace(/^Suivre /, '')}, cliquer pour ne plus suivre` : ''}</span>
      </button>
      {following && !error && <p className="text-[13px] text-text-secondary">Les nouvelles dates arrivent dans ton compte.</p>}
      {error && (
        <p className="text-[13px] font-medium text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
