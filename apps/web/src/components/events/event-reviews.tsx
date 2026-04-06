'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { StarRating } from './star-rating'
import { Star, MessageSquare, User, Loader2, Trash2, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { User as SupabaseUser } from '@supabase/supabase-js'

interface Review {
  id: string
  rating: number
  comment: string | null
  createdAt: string
  userName: string | null
  userAvatar: string | null
}

interface ReviewStats {
  avgRating: number | null
  totalReviews: number
}

interface Props {
  eventId: string
}

export function EventReviews({ eventId }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [stats, setStats] = useState<ReviewStats>({ avgRating: null, totalReviews: 0 })
  const [userReview, setUserReview] = useState<{ id: string; rating: number; comment: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [supabase])

  const fetchReviews = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews?eventId=${eventId}`)
      const data = await res.json()
      setReviews(data.reviews ?? [])
      setStats(data.stats ?? { avgRating: null, totalReviews: 0 })
      if (data.userReview) {
        setUserReview(data.userReview)
        setRating(data.userReview.rating)
        setComment(data.userReview.comment ?? '')
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    fetchReviews()
  }, [fetchReviews])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rating === 0) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, rating, comment }),
      })

      if (res.status === 401) {
        window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname)
        return
      }

      if (res.ok) {
        setIsEditing(false)
        await fetchReviews()
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Supprimer ton avis ?')) return
    setSubmitting(true)
    try {
      await fetch(`/api/reviews?eventId=${eventId}`, { method: 'DELETE' })
      setUserReview(null)
      setRating(0)
      setComment('')
      setIsEditing(false)
      await fetchReviews()
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = () => {
    if (userReview) {
      setRating(userReview.rating)
      setComment(userReview.comment ?? '')
    }
    setIsEditing(true)
  }

  const ratingDistribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
    pct: reviews.length > 0 ? (reviews.filter((r) => r.rating === star).length / reviews.length) * 100 : 0,
  }))

  return (
    <div className="mt-10">
      <h2 className="flex items-center gap-2 text-[15px] font-bold text-text-primary">
        <MessageSquare className="h-4 w-4 text-accent" />
        Avis des membres
        {stats.totalReviews > 0 && (
          <span className="text-[13px] font-normal text-text-muted">({stats.totalReviews})</span>
        )}
      </h2>

      {/* Stats summary */}
      {stats.totalReviews > 0 && (
        <div className="mt-4 flex gap-6 rounded-2xl border border-border/60 bg-surface p-4">
          {/* Average */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-3xl font-bold text-text-primary">
              {stats.avgRating?.toFixed(1)}
            </span>
            <StarRating value={Math.round(stats.avgRating ?? 0)} readonly size="sm" />
            <span className="text-[11px] text-text-muted">
              {stats.totalReviews} avis
            </span>
          </div>

          {/* Distribution bars */}
          <div className="flex flex-1 flex-col justify-center gap-1">
            {ratingDistribution.map(({ star, count, pct }) => (
              <div key={star} className="flex items-center gap-2">
                <span className="w-3 text-[11px] text-text-muted text-right">{star}</span>
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <div className="flex-1 h-1.5 rounded-full bg-surface-hover overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-5 text-[10px] text-text-muted text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User's existing review or form */}
      {user && !loading && (
        <div className="mt-4">
          {userReview && !isEditing ? (
            <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-accent">Ton avis</span>
                  <StarRating value={userReview.rating} readonly size="sm" />
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={startEdit}
                    className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
                    title="Modifier"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={submitting}
                    className="rounded-lg p-1.5 text-text-muted hover:bg-red-500/10 hover:text-red-500 transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {userReview.comment && (
                <p className="mt-2 text-[13px] text-text-secondary leading-relaxed">
                  {userReview.comment}
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="rounded-2xl border border-border/60 bg-surface p-4">
              <p className="text-[13px] font-semibold text-text-primary">
                {userReview ? 'Modifier ton avis' : 'Donne ton avis'}
              </p>

              <div className="mt-3 flex items-center gap-3">
                <StarRating value={rating} onChange={setRating} size="lg" />
                {rating > 0 && (
                  <span className="text-[13px] text-text-muted">
                    {rating === 1 && 'Bof'}
                    {rating === 2 && 'Moyen'}
                    {rating === 3 && 'Pas mal'}
                    {rating === 4 && 'Top !'}
                    {rating === 5 && 'Incroyable !'}
                  </span>
                )}
              </div>

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Un commentaire ? (optionnel)"
                rows={3}
                maxLength={500}
                className="mt-3 w-full resize-none rounded-xl border border-border/60 bg-bg px-3 py-2.5 text-[13px] text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
              />

              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-text-muted">{comment.length}/500</span>
                <div className="flex gap-2">
                  {isEditing && (
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-text-muted hover:text-text-primary transition-colors"
                    >
                      Annuler
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={rating === 0 || submitting}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-all',
                      rating > 0
                        ? 'bg-accent text-white hover:bg-accent-hover active:scale-[0.98]'
                        : 'bg-surface-hover text-text-muted cursor-not-allowed'
                    )}
                  >
                    {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {userReview ? 'Modifier' : 'Publier'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Login prompt */}
      {!user && !loading && (
        <div className="mt-4 rounded-2xl border border-border/60 bg-surface p-4 text-center">
          <p className="text-[13px] text-text-secondary">
            <a href={`/login?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')}`} className="font-semibold text-accent hover:text-accent-hover transition-colors">
              Connecte-toi
            </a>
            {' '}pour donner ton avis
          </p>
        </div>
      )}

      {/* Reviews list */}
      {reviews.length > 0 && (
        <div className="mt-5 space-y-3">
          {reviews
            .filter((r) => !userReview || r.id !== userReview.id)
            .map((review) => (
              <div key={review.id} className="rounded-xl border border-border/40 bg-surface/50 p-4">
                <div className="flex items-center gap-2.5">
                  {review.userAvatar ? (
                    <Image
                      src={review.userAvatar}
                      alt=""
                      width={28}
                      height={28}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10">
                      <User className="h-3.5 w-3.5 text-accent" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-text-primary truncate">
                        {review.userName ?? 'Membre'}
                      </span>
                      <StarRating value={review.rating} readonly size="sm" />
                    </div>
                    <span className="text-[11px] text-text-muted">
                      {new Date(review.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
                {review.comment && (
                  <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
                    {review.comment}
                  </p>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && reviews.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-border/60 py-8 text-center">
          <Star className="mx-auto h-8 w-8 text-text-muted/30" />
          <p className="mt-2 text-[13px] text-text-muted">Aucun avis pour le moment</p>
          <p className="text-[12px] text-text-muted/70">Sois le premier à donner ton avis !</p>
        </div>
      )}

      {loading && (
        <div className="mt-4 flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
        </div>
      )}
    </div>
  )
}
