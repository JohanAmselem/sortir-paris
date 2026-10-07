'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pencil, Trash2 } from 'lucide-react'
import { StarRating } from './star-rating'

interface Review {
  id: string
  rating: number
  comment: string | null
  createdAt: string
  userName: string | null
}

interface ReviewsResponse {
  reviews: Review[]
  stats: { avgRating: number | null; totalReviews: number }
  userReview: { rating: number; comment: string | null } | null
  canReview: boolean
  loggedIn: boolean
}

const COMMENT_MAX = 1000
const dateFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Member reviews. Reviews open once the event has started (enforced by the
 * API); rating 1–5, comment up to 1000 characters.
 */
export function EventReviews({ eventId }: { eventId: string }) {
  const pathname = usePathname()
  const [data, setData] = useState<ReviewsResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews?eventId=${encodeURIComponent(eventId)}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const d = (await res.json()) as ReviewsResponse
      setData(d)
      setRating(d.userReview?.rating ?? 0)
      setComment(d.userReview?.comment ?? '')
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rating) {
      setError('Choisis une note de 1 à 5.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, rating, comment: comment.trim() || null }),
      })
      if (res.status === 401) {
        window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname)
        return
      }
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        setError(d.error ?? 'Ton avis n’a pas pu être enregistré.')
        return
      }
      setEditing(false)
      await load()
    } catch {
      setError('Connexion perdue, réessaie.')
    } finally {
      setSubmitting(false)
    }
  }

  const remove = async () => {
    if (!window.confirm('Supprimer ton avis ?')) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/reviews?eventId=${encodeURIComponent(eventId)}`, { method: 'DELETE' })
      if (res.ok) {
        setRating(0)
        setComment('')
        await load()
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (failed) return null
  if (!data) return <div className="skeleton mt-10 h-24 rounded-xl" aria-hidden />

  const { stats, reviews, userReview, canReview, loggedIn } = data
  const showForm = canReview && loggedIn && (!userReview || editing)

  return (
    <section aria-labelledby="reviews-title" className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="reviews-title" className="font-display text-[1.8rem] text-ink">
          L’avis des membres
        </h2>
        {stats.totalReviews > 0 && stats.avgRating != null && (
          <p className="flex items-center gap-2 text-[14px] text-text-secondary">
            <StarRating value={stats.avgRating} readonly size="sm" />
            <span className="font-semibold text-ink">{stats.avgRating.toLocaleString('fr-FR')}</span>
            <span>
              · {stats.totalReviews} avis
            </span>
          </p>
        )}
      </div>

      {!canReview ? (
        <p className="mt-3 text-[15px] text-text-secondary">Les avis s’ouvrent quand l’événement commence. Garde-le pour ne pas l’oublier.</p>
      ) : !loggedIn ? (
        <p className="mt-3 text-[15px] text-text-secondary">
          Tu y es allé ?{' '}
          <Link
            href={`/login?next=${encodeURIComponent(pathname || '/')}`}
            className="font-semibold text-accent underline underline-offset-2"
          >
            Connecte-toi pour le noter
          </Link>
          .
        </p>
      ) : userReview && !editing ? (
        <div className="mt-4 rounded-xl border border-accent bg-accent-soft p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14px] font-semibold text-ink">Ton avis</p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex h-11 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-accent hover:bg-surface"
              >
                <Pencil className="h-4 w-4" aria-hidden />
                Modifier
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={submitting}
                className="inline-flex h-11 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-text-secondary hover:bg-surface"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Supprimer
              </button>
            </div>
          </div>
          <StarRating value={userReview.rating} readonly size="sm" className="mt-1" />
          {userReview.comment && <p className="mt-2 whitespace-pre-line text-[15px] text-ink">{userReview.comment}</p>}
        </div>
      ) : null}

      {showForm && (
        <form onSubmit={submit} className="mt-4 rounded-xl border border-border bg-surface p-4" noValidate>
          <StarRating value={rating} onChange={setRating} size="lg" label="Ta note sur 5" />
          <label htmlFor={`review-${eventId}`} className="mt-3 block text-[14px] font-semibold text-ink">
            Ton commentaire <span className="font-normal text-text-muted">(facultatif)</span>
          </label>
          <textarea
            id={`review-${eventId}`}
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
            maxLength={COMMENT_MAX}
            rows={3}
            className="mt-1.5 w-full rounded-lg border border-border-strong bg-paper p-3 text-[15px] text-ink focus:border-accent focus:outline-none"
            placeholder="Ce que tu en as pensé, en deux mots ou plus."
          />
          <div className="mt-1 flex items-center justify-between text-[12px] text-text-muted">
            <span aria-live="polite">{error && <span className="font-medium text-error">{error}</span>}</span>
            <span className="tabular-nums">
              {comment.length}/{COMMENT_MAX}
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-semibold text-paper disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {userReview ? 'Mettre à jour' : 'Publier mon avis'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="inline-flex h-11 items-center rounded-full px-4 text-[14px] font-semibold text-text-secondary"
              >
                Annuler
              </button>
            )}
          </div>
        </form>
      )}

      {reviews.length > 0 && (
        <ul className="mt-5 divide-y divide-border">
          {reviews.map((r) => (
            <li key={r.id} className="py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[14px] font-semibold text-ink">{r.userName ?? 'Un membre'}</p>
                <time className="text-[12px] text-text-muted" dateTime={r.createdAt}>
                  {dateFmt.format(new Date(r.createdAt))}
                </time>
              </div>
              <StarRating value={r.rating} readonly size="sm" className="mt-1" />
              {r.comment && <p className="mt-2 whitespace-pre-line text-[15px] text-text-secondary">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
