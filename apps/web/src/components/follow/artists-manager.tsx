'use client'

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Music, Plus, Search, X } from 'lucide-react'
import { artistDisplayName, artistKey, isValidArtistKey } from '@/lib/artists'
import { formatWhen } from '@/lib/paris-time'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

export interface FollowedArtist {
  id: string
  term: string
  label: string
  dates: Array<{ slug: string; title: string; startDate: string; timeKnown: boolean; venueName: string | null }>
}

interface Suggestion {
  key: string
  name: string
  dates: number
}

const toLogin = () => {
  window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname)
}

/** « Mes artistes »: search (suggestions + free typing) and the followed list. */
export function ArtistsManager({ initial, spotifyImport = false }: { initial: FollowedArtist[]; spotifyImport?: boolean }) {
  const router = useRouter()
  const [artists, setArtists] = useState(initial)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const listId = useId()

  // Server data refreshed (router.refresh after a follow): take its dates.
  useEffect(() => setArtists(initial), [initial])

  const key = artistKey(query)
  useEffect(() => {
    if (key.length < 2) {
      setSuggestions([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      setLoading(true)
      fetch(`/api/artists/suggest?q=${encodeURIComponent(key)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { artists: [] }))
        .then((d: { artists?: Suggestion[] }) => setSuggestions(d.artists ?? []))
        .catch(() => {})
        .finally(() => setLoading(false))
    }, 200)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [key])

  const followed = new Set(artists.map((a) => artistKey(a.term)))

  const follow = async (name: string, k: string) => {
    if (busyKey) return
    setBusyKey(k)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/follows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'artist', term: k, label: name }),
      })
      if (res.status === 401) return toLogin()
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Échec, réessaie.')
        return
      }
      setArtists((list) => (list.some((a) => artistKey(a.term) === k) ? list : [{ id: data.id ?? k, term: k, label: name, dates: [] }, ...list]))
      setMessage(`Tu suis ${name}. On te prévient dès qu’une date est annoncée à Paris.`)
      setQuery('')
      setSuggestions([])
      track('follow', { kind: 'artist' })
      router.refresh()
    } catch {
      setError('Connexion perdue, réessaie.')
    } finally {
      setBusyKey(null)
    }
  }

  const unfollow = async (a: FollowedArtist) => {
    const before = artists
    setArtists((list) => list.filter((x) => x.id !== a.id))
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/follows', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a.id) ? { id: a.id } : { kind: 'artist', term: a.term }),
      })
      if (res.status === 401) return toLogin()
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      setArtists(before)
      setError(`Impossible de ne plus suivre ${a.label}, réessaie.`)
    }
  }

  const typedName = artistDisplayName(query)
  const canFollowTyped = isValidArtistKey(key) && !followed.has(key) && !suggestions.some((s) => s.key === key)

  return (
    <div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          const exact = suggestions.find((s) => s.key === key)
          if (exact && !followed.has(exact.key)) follow(exact.name, exact.key)
          else if (canFollowTyped) follow(typedName, key)
        }}
      >
        <label htmlFor={`${listId}-input`} className="text-[14px] font-semibold text-ink">
          Ajouter un artiste
        </label>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            id={`${listId}-input`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Un groupe, une chanteuse, un DJ…"
            autoComplete="off"
            maxLength={120}
            aria-controls={`${listId}-list`}
            className="h-12 w-full rounded-full border border-border-strong bg-surface pl-11 pr-11 text-[16px] text-ink placeholder:text-text-muted focus:border-ink focus:outline-none"
          />
          {loading && <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-muted" aria-hidden />}
        </div>
      </form>

      {(suggestions.length > 0 || canFollowTyped) && (
        <ul id={`${listId}-list`} className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {suggestions.map((s) => {
            const isFollowed = followed.has(s.key)
            return (
              <li key={s.key} className="flex min-h-[56px] items-center gap-3 px-4 py-2">
                <Music className="h-5 w-5 shrink-0 text-accent" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink">{s.name}</span>
                  <span className="block text-[13px] text-text-secondary">
                    {s.dates} date{s.dates > 1 ? 's' : ''} à venir à Paris
                  </span>
                </span>
                <FollowSmallButton
                  following={isFollowed}
                  busy={busyKey === s.key}
                  onClick={() => !isFollowed && follow(s.name, s.key)}
                  name={s.name}
                />
              </li>
            )
          })}
          {canFollowTyped && (
            <li className="flex min-h-[56px] items-center gap-3 px-4 py-2">
              <Plus className="h-5 w-5 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-ink">{typedName}</span>
                <span className="block text-[13px] text-text-secondary">Pas de date annoncée pour l’instant : on te prévient dès qu’il y en a une.</span>
              </span>
              <FollowSmallButton following={false} busy={busyKey === key} onClick={() => follow(typedName, key)} name={typedName} />
            </li>
          )}
        </ul>
      )}

      {message && (
        <p role="status" className="mt-3 text-[14px] font-medium text-accent">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[14px] font-medium text-error">
          {error}
        </p>
      )}

      <h2 className="font-display mt-10 text-[2rem] text-ink">
        Tes artistes{artists.length > 0 && <span className="ml-2 text-[1.4rem] text-text-muted">{artists.length}</span>}
      </h2>
      {artists.length === 0 ? (
        <p className="mt-3 text-[15px] text-text-secondary">
          Tu ne suis encore aucun artiste. Cherche-les ci-dessus{spotifyImport ? ', importe-les depuis Spotify' : ''} ou appuie sur « Suivre » sur la page d’un concert.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {artists.map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-4 py-3">
              <Music className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink">{a.label}</p>
                {a.dates.length ? (
                  <ul className="mt-1 space-y-0.5">
                    {a.dates.map((d) => (
                      <li key={d.slug} className="truncate text-[13px] text-text-secondary">
                        <Link href={`/evenements/${d.slug}`} className="hover:text-ink hover:underline">
                          {formatWhen(d)}
                          {d.venueName && ` · ${d.venueName}`}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 text-[13px] text-text-secondary">Pas de date à Paris pour l’instant.</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => unfollow(a)}
                className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface-hover hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden />
                Ne plus suivre
                <span className="sr-only"> {a.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FollowSmallButton({ following, busy, onClick, name }: { following: boolean; busy: boolean; onClick: () => void; name: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || following}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
        following ? 'border-accent bg-accent-soft text-accent' : 'border-border-strong bg-surface text-ink hover:border-ink'
      )}
    >
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {following ? 'Suivi' : 'Suivre'}
      <span className="sr-only"> {name}</span>
    </button>
  )
}
