'use client'

import { useEffect, useState, useTransition } from 'react'
import { Bell, BellRing } from 'lucide-react'
import { cn } from '@/lib/utils'
import { track } from '@/lib/analytics'
import { startPendingFollow } from '@/lib/pending-follow'

export type FollowTarget = { kind: 'venue'; venueId: string; name?: string } | { kind: 'artist'; term: string; label: string }

interface FollowButtonProps {
  target: FollowTarget
  /** Shown in the button: "Suivre ce lieu", "Suivre « Cyrano »". */
  label: string
  className?: string
  /** Small pill showing only « Suivre » / « Suivi » (the full label stays for screen readers). */
  compact?: boolean
}

function query(t: FollowTarget): string {
  return t.kind === 'venue' ? `venueId=${encodeURIComponent(t.venueId)}` : `term=${encodeURIComponent(t.term)}`
}

/**
 * Follow a venue or an artist / work: its new dates show up in « Nouveautés
 * pour toi » (compte, Club) and in the « Alertes concerts ». Optimistic toggle.
 * Visitors: the follow is kept (pending-follow cookie) while they log in, and
 * created on their return (lib/pending-follow.ts).
 */
export function FollowButton({ target, label, className, compact = false }: FollowButtonProps) {
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
          if (previous) return
          const name = target.kind === 'venue' ? (target.name ?? label.replace(/^Suivre\s+/, '')) : target.label
          track('alerts_pending_follow_created', { kind: target.kind, from: 'follow_button' })
          startPendingFollow(
            target.kind === 'venue' ? { kind: 'venue', venueId: target.venueId, label: name } : { kind: 'artist', term: target.term, label: target.label }
          )
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

  if (!loaded) return <div className={cn(compact ? 'h-9 w-20' : 'h-11', className)} aria-hidden />

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={following}
        className={cn(
          'inline-flex max-w-full items-center justify-center rounded-full border font-semibold transition-colors',
          compact ? 'h-9 gap-1.5 px-3 text-[13px]' : 'h-11 gap-2 px-4 text-[14px]',
          following ? 'border-accent bg-accent-soft text-accent' : 'border-border-strong bg-surface text-ink hover:border-ink'
        )}
      >
        {following ? <BellRing className="h-4 w-4 shrink-0" aria-hidden /> : <Bell className="h-4 w-4 shrink-0" aria-hidden />}
        <span className="truncate" aria-hidden={compact || undefined}>
          {following ? 'Suivi' : compact ? 'Suivre' : label}
        </span>
        <span className="sr-only">
          {following ? `${compact ? 'Suivi' : ''} : ${label.replace(/^Suivre /, '')}, cliquer pour ne plus suivre` : compact ? label : ''}
        </span>
      </button>
      {following && !error && !compact && <p className="text-[13px] text-text-secondary">Les nouvelles dates arrivent dans ton compte.</p>}
      {error && (
        <p className="text-[13px] font-medium text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
