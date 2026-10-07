'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Heart, MapPin, RotateCcw, X } from 'lucide-react'
import { EventImage } from '@/components/ui/event-image'
import { EventCard } from '@/components/events/event-card'
import { formatPrice } from '@/lib/format'
import { formatWhen } from '@/lib/paris-time'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import type { CardEvent } from '@/lib/events/types'
import { MATCH_DAILY_LIMIT, MATCH_SIGNUP_NUDGE_AT } from '@/app/club/_lib/deck'
import { addLocalSwipe, localSwipesToday, readLocalSwipes } from '@/app/club/_lib/local'

type Direction = 'left' | 'right'

interface DeckResponse {
  events: CardEvent[]
  loggedIn: boolean
  swipesToday: number
  remaining: number
  liked: CardEvent[]
}

type Status = 'loading' | 'ready' | 'error'

const SWIPE_THRESHOLD = 90

export function MatchGame() {
  const [status, setStatus] = useState<Status>('loading')
  const [deck, setDeck] = useState<CardEvent[]>([])
  const [index, setIndex] = useState(0)
  const [loggedIn, setLoggedIn] = useState(false)
  const [remaining, setRemaining] = useState(MATCH_DAILY_LIMIT)
  const [sessionSwipes, setSessionSwipes] = useState(0)
  const [liked, setLiked] = useState<CardEvent[]>([])
  const [leaving, setLeaving] = useState<Direction | null>(null)
  const [dragX, setDragX] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const dragStart = useRef<number | null>(null)
  const busy = useRef(false)
  const now = useRef(new Date())

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const res = await fetch('/api/swipe', { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as DeckResponse
      now.current = new Date()
      if (data.loggedIn) {
        setDeck(data.events)
        setRemaining(data.remaining)
        setLiked(data.liked)
      } else {
        const local = readLocalSwipes()
        const seen = new Set(local.map((s) => s.eventId))
        setDeck(data.events.filter((e) => !seen.has(e.id)))
        setRemaining(Math.max(0, MATCH_DAILY_LIMIT - localSwipesToday()))
        const likedIds = new Set(local.filter((s) => s.direction === 'right').map((s) => s.eventId))
        setLiked(data.events.filter((e) => likedIds.has(e.id)))
      }
      setLoggedIn(data.loggedIn)
      setIndex(0)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const current = deck[index] ?? null
  const done = status === 'ready' && (!current || remaining <= 0)

  const swipe = useCallback(
    async (direction: Direction) => {
      if (!current || busy.current || remaining <= 0) return
      busy.current = true
      setLeaving(direction)
      setNotice(null)
      track('match_swipe', { direction, logged: loggedIn, category: current.category?.slug ?? null })

      let ok = true
      if (loggedIn) {
        try {
          const res = await fetch('/api/swipe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId: current.id, direction }),
          })
          if (res.status === 429) {
            setRemaining(0)
            ok = false
          } else if (res.status === 401) {
            setLoggedIn(false)
            addLocalSwipe({ eventId: current.id, direction, category: current.category?.slug ?? null })
          } else if (res.ok) {
            const data = (await res.json()) as { remaining?: number }
            if (typeof data.remaining === 'number') setRemaining(data.remaining)
          } else {
            ok = false
            setNotice('Ce swipe n’a pas été enregistré. Réessaie.')
          }
        } catch {
          ok = false
          setNotice('Connexion perdue. Réessaie dans un instant.')
        }
      } else {
        addLocalSwipe({ eventId: current.id, direction, category: current.category?.slug ?? null })
        setRemaining((r) => Math.max(0, r - 1))
      }

      window.setTimeout(() => {
        if (ok) {
          if (direction === 'right') setLiked((l) => [current, ...l.filter((e) => e.id !== current.id)])
          setSessionSwipes((n) => n + 1)
          setIndex((i) => i + 1)
        }
        setLeaving(null)
        setDragX(0)
        busy.current = false
      }, 260)
    },
    [current, loggedIn, remaining]
  )

  // Keyboard: ← / →
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (e.key === 'ArrowLeft') swipe('left')
      if (e.key === 'ArrowRight') swipe('right')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [swipe])

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('a,button')) return
    dragStart.current = e.clientX
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current == null) return
    setDragX(e.clientX - dragStart.current)
  }
  const onPointerUp = () => {
    if (dragStart.current == null) return
    dragStart.current = null
    if (dragX > SWIPE_THRESHOLD) swipe('right')
    else if (dragX < -SWIPE_THRESHOLD) swipe('left')
    else setDragX(0)
  }

  const showNudge = !loggedIn && sessionSwipes >= MATCH_SIGNUP_NUDGE_AT

  if (status === 'loading') {
    return (
      <div className="mx-auto mt-8 max-w-sm" aria-busy="true" aria-live="polite">
        <div className="skeleton aspect-[3/4] w-full rounded-2xl" />
        <p className="sr-only">Chargement des cartes…</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="mx-auto mt-8 max-w-sm rounded-xl border border-border bg-surface p-6 text-center" role="alert">
        <p className="text-[15px] text-text-secondary">Les cartes n’ont pas pu être chargées.</p>
        <button
          type="button"
          onClick={load}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-semibold text-paper"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Réessayer
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto mt-6 max-w-sm">
      <p className="text-center text-[13px] font-semibold tabular-nums text-text-muted" aria-live="polite">
        {remaining > 0 ? `Encore ${remaining} carte${remaining > 1 ? 's' : ''} aujourd’hui` : 'C’est tout pour aujourd’hui'}
      </p>

      {done ? (
        <EndOfDeck limit={remaining <= 0} loggedIn={loggedIn} likes={liked.length} />
      ) : (
        current && (
          <>
            <article
              aria-roledescription="carte"
              aria-label={current.title}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={leaving ? undefined : { transform: `translateX(${dragX}px) rotate(${dragX / 25}deg)` }}
              className={cn(
                'relative mt-3 touch-pan-y select-none overflow-hidden rounded-2xl border border-border bg-surface shadow-lg',
                leaving === 'right' && 'animate-swipe-right',
                leaving === 'left' && 'animate-swipe-left',
                !leaving && dragStart.current == null && 'transition-transform duration-200'
              )}
            >
              <div className="relative aspect-[4/3] bg-paper-deep">
                <EventImage src={current.imageUrl} alt="" sizes="384px" categorySlug={current.category?.slug} priority />
                {dragX > 30 && (
                  <span className="absolute left-4 top-4 rotate-[-8deg] rounded-md border-2 border-free bg-surface px-2 py-1 text-[15px] font-bold uppercase text-free">
                    Ça me tente
                  </span>
                )}
                {dragX < -30 && (
                  <span className="absolute right-4 top-4 rotate-[8deg] rounded-md border-2 border-neon bg-surface px-2 py-1 text-[15px] font-bold uppercase text-neon">
                    Bof
                  </span>
                )}
              </div>
              <div className="p-5">
                <p className="text-[13px] font-semibold text-accent">{formatWhen(current, now.current)}</p>
                <h2 className="font-display mt-1 text-[2rem] text-ink">{current.title}</h2>
                {current.venue && (
                  <p className="mt-2 flex items-center gap-1 text-[14px] text-text-secondary">
                    <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{current.venue.name}</span>
                    {current.venue.arrondissement && <span className="shrink-0 text-text-muted">· {current.venue.arrondissement}</span>}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[14px] font-semibold text-ink">{formatPrice(current).label}</span>
                  {current.category && <span className="text-[13px] text-text-muted">{current.category.name}</span>}
                </div>
                <Link
                  href={`/evenements/${current.slug}`}
                  className="mt-3 inline-flex h-11 items-center text-[14px] font-semibold text-accent underline underline-offset-2"
                >
                  Voir la fiche
                </Link>
              </div>
            </article>

            <div className="mt-5 flex items-center justify-center gap-6">
              <button
                type="button"
                onClick={() => swipe('left')}
                disabled={!!leaving}
                aria-label="Pas pour moi (flèche gauche)"
                className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-border-strong bg-surface text-neon transition-transform hover:border-neon active:scale-95 disabled:opacity-50"
              >
                <X className="h-7 w-7" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => swipe('right')}
                disabled={!!leaving}
                aria-label="Ça me tente (flèche droite)"
                className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-paper shadow-md transition-transform hover:bg-accent-hover active:scale-95 disabled:opacity-50"
              >
                <Heart className="h-7 w-7" aria-hidden />
              </button>
            </div>
            <p className="mt-3 hidden text-center text-[13px] text-text-muted sm:block">Astuce : ← et → au clavier.</p>
          </>
        )
      )}

      {notice && (
        <p className="mt-4 text-center text-[14px] font-medium text-error" role="alert">
          {notice}
        </p>
      )}

      {showNudge && !done && (
        <div className="mt-6 rounded-xl border border-accent bg-accent-soft p-4 text-[14px] text-ink" role="status">
          <p className="font-semibold">Déjà {sessionSwipes} swipes, joli.</p>
          <p className="mt-1 text-text-secondary">
            Ils sont gardés sur cet appareil. Crée ton compte pour les retrouver partout et recevoir ton Drop perso.
          </p>
          <Link
            href="/login?next=/match"
            className="mt-3 inline-flex h-11 items-center rounded-full bg-ink px-4 text-[14px] font-semibold text-paper"
          >
            Garder mes swipes
          </Link>
        </div>
      )}

      {liked.length > 0 && (
        <section aria-labelledby="liked-title" className="mt-10">
          <h2 id="liked-title" className="font-display text-[1.8rem] text-ink">
            Tes coups de cœur
          </h2>
          <p className="mt-1 text-[14px] text-text-secondary">
            {loggedIn ? 'Garde ceux où tu veux vraiment aller.' : 'Connecte-toi pour les garder dans tes sorties.'}
          </p>
          <div className="mt-2 divide-y divide-border">
            {liked.slice(0, 12).map((e) => (
              <EventCard key={e.id} event={e} variant="row" now={now.current} showSave={loggedIn} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function EndOfDeck({ limit, loggedIn, likes }: { limit: boolean; loggedIn: boolean; likes: number }) {
  return (
    <div className="mt-3 rounded-2xl border border-border bg-surface p-6 text-center">
      <p className="font-display text-[2.2rem] text-ink">{limit ? 'À demain !' : 'Tu as tout vu'}</p>
      <p className="mt-2 text-[15px] text-text-secondary">
        {limit
          ? `Tu as utilisé tes ${MATCH_DAILY_LIMIT} cartes du jour. De nouvelles sorties arrivent chaque jour.`
          : 'Plus de cartes pour l’instant. De nouvelles sorties arrivent chaque jour.'}{' '}
        {likes > 0 && `${likes} coup${likes > 1 ? 's' : ''} de cœur en route vers ton Drop.`}
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href="/drop" className="inline-flex h-11 items-center justify-center rounded-full bg-ink px-5 text-[14px] font-semibold text-paper">
          Voir mon Drop
        </Link>
        <Link
          href="/quiz"
          className="inline-flex h-11 items-center justify-center rounded-full border border-border-strong bg-surface px-5 text-[14px] font-semibold text-ink"
        >
          Faire le quiz
        </Link>
        {!loggedIn && (
          <Link
            href="/login?next=/match"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border-strong bg-surface px-5 text-[14px] font-semibold text-ink"
          >
            Créer mon compte
          </Link>
        )}
      </div>
    </div>
  )
}
