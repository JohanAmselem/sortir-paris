'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MapPin, Music, X } from 'lucide-react'
import type { Follow } from '@/lib/follows'

/** The member's follows with an « Ne plus suivre » button each (optimistic). */
export function FollowsList({ initial }: { initial: Follow[] }) {
  const [follows, setFollows] = useState(initial)
  const [error, setError] = useState<string | null>(null)

  const unfollow = async (f: Follow) => {
    const before = follows
    setFollows((list) => list.filter((x) => x.id !== f.id))
    setError(null)
    try {
      const res = await fetch('/api/follows', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f.id }),
      })
      if (res.status === 401) {
        window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname)
        return
      }
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      setFollows(before)
      setError(`Impossible de ne plus suivre « ${f.label} », réessaie.`)
    }
  }

  if (!follows.length) {
    return (
      <p className="text-[15px] text-text-secondary">
        Tu ne suis plus rien. Sur la page d’un lieu ou d’un événement, appuie sur « Suivre » pour retrouver ici ses nouvelles dates.
      </p>
    )
  }

  return (
    <>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {follows.map((f) => {
          const Icon = f.kind === 'venue' ? MapPin : Music
          const href =
            f.kind === 'venue' && f.venueSlug ? `/lieux/${f.venueSlug}` : f.term ? `/evenements?q=${encodeURIComponent(f.label)}` : null
          return (
            <li key={f.id} className="flex min-h-[60px] items-center gap-3 px-4 py-2">
              <Icon className="h-5 w-5 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1">
                {href ? (
                  <Link href={href} className="block truncate text-[15px] font-semibold text-ink hover:underline">
                    {f.label}
                  </Link>
                ) : (
                  <span className="block truncate text-[15px] font-semibold text-ink">{f.label}</span>
                )}
                <span className="block text-[13px] text-text-secondary">{f.kind === 'venue' ? 'Lieu' : 'Artiste ou œuvre'}</span>
              </span>
              <button
                type="button"
                onClick={() => unfollow(f)}
                className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface-hover hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden />
                Ne plus suivre
                <span className="sr-only"> {f.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {error && (
        <p className="mt-2 text-[13px] font-medium text-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
