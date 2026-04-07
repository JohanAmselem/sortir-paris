'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import {
  QUIZ_QUESTIONS,
  QUIZ_CATEGORIES,
  ARCHETYPES,
  DIMENSION_LABELS,
  type Archetype,
} from '@/lib/taste-quiz-data'
import { ChevronRight, Lock, Sparkles, RotateCcw, Share2, ArrowRight, Zap } from 'lucide-react'

type Phase = 'intro' | 'playing' | 'computing' | 'result'

interface TasteProfile {
  exploration: number
  energy: number
  social: number
  budget: number
  planning: number
  mainstream: number
  visual: number
  depth: number
  archetype: string
  archetypeLabel?: string
  aiSummary?: string
}

export function QuizGame() {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<boolean | null>(null)
  const [phase, setPhase] = useState<Phase>('intro')
  const [answers, setAnswers] = useState<Record<string, 'a' | 'b'>>({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [profile, setProfile] = useState<TasteProfile | null>(null)
  const [xpAwarded, setXpAwarded] = useState(0)
  const [hasExisting, setHasExisting] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [selectedSide, setSelectedSide] = useState<'a' | 'b' | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const currentQuestion = QUIZ_QUESTIONS[currentIndex]
  const currentCategory = QUIZ_CATEGORIES.find(c => c.id === currentQuestion?.category)
  const progress = (currentIndex / QUIZ_QUESTIONS.length) * 100

  // Check auth & existing profile
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(!!data.user)
      if (data.user) {
        fetch('/api/taste-quiz')
          .then(r => r.json())
          .then(d => {
            if (d.completed && d.profile) {
              setProfile(d.profile)
              setHasExisting(true)
            }
          })
          .catch(() => {})
      }
    })
  }, [supabase])

  const handleAnswer = useCallback((choice: 'a' | 'b') => {
    if (animating) return
    setSelectedSide(choice)
    setAnimating(true)

    const newAnswers = { ...answers, [currentQuestion.id]: choice }
    setAnswers(newAnswers)

    setTimeout(() => {
      if (currentIndex < QUIZ_QUESTIONS.length - 1) {
        setCurrentIndex(i => i + 1)
        setSelectedSide(null)
        setAnimating(false)
      } else {
        // Quiz complete → submit
        setPhase('computing')
        submitQuiz(newAnswers)
      }
    }, 400)
  }, [animating, answers, currentIndex, currentQuestion])

  const submitQuiz = async (finalAnswers: Record<string, 'a' | 'b'>) => {
    try {
      const res = await fetch('/api/taste-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: finalAnswers }),
      })
      const data = await res.json()
      if (data.profile) {
        setProfile(data.profile)
        setXpAwarded(data.xpAwarded ?? 0)
      }
      // Dramatic reveal delay
      setTimeout(() => setPhase('result'), 1500)
    } catch {
      setPhase('result')
    }
  }

  const startQuiz = () => {
    setAnswers({})
    setCurrentIndex(0)
    setProfile(null)
    setSelectedSide(null)
    setPhase('playing')
  }

  // ─── Not logged in ───
  if (user === false) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
        <div className="rounded-2xl bg-surface-hover/50 p-6">
          <Lock className="mx-auto h-10 w-10 text-text-muted" />
          <h2 className="mt-4 text-lg font-bold text-text-primary">Connecte-toi pour jouer</h2>
          <p className="mt-2 text-sm text-text-secondary">Découvre ton profil culturel unique</p>
          <Link
            href="/login"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white"
          >
            Se connecter <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    )
  }

  // ─── Intro ───
  if (phase === 'intro') {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        {/* Hero */}
        <div className="text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-accent to-neon shadow-lg">
            <span className="text-4xl">🎯</span>
          </div>
          <h1 className="mt-6 text-2xl font-black text-text-primary">
            Tu préfères...
          </h1>
          <p className="mt-2 text-sm text-text-secondary leading-relaxed">
            40 questions pour découvrir ton profil culturel unique.
            <br />
            Réponds vite, fais confiance à ton instinct !
          </p>
        </div>

        {/* Categories preview */}
        <div className="mt-8 grid grid-cols-2 gap-2">
          {QUIZ_CATEGORIES.map(cat => (
            <div key={cat.id} className="flex items-center gap-2 rounded-xl bg-surface-hover/50 px-3 py-2">
              <span className="text-lg">{cat.icon}</span>
              <span className="text-[12px] font-medium text-text-secondary">{cat.title}</span>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="mt-6 flex justify-center gap-6">
          <div className="text-center">
            <p className="text-2xl font-black text-accent">40</p>
            <p className="text-[11px] text-text-muted">questions</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-neon">5 min</p>
            <p className="text-[11px] text-text-muted">chrono</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-free">+50</p>
            <p className="text-[11px] text-text-muted">XP</p>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={startQuiz}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-accent to-accent-hover py-4 text-[15px] font-bold text-white shadow-lg shadow-accent/25 transition-all hover:shadow-xl active:scale-[0.98]"
        >
          <Sparkles className="h-5 w-5" />
          {hasExisting ? 'Refaire le quiz' : 'Découvrir mon profil'}
        </button>

        {/* Existing result */}
        {hasExisting && profile && (
          <button
            onClick={() => setPhase('result')}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-border py-3 text-[13px] font-semibold text-text-secondary hover:bg-surface-hover transition-colors"
          >
            Voir mon profil actuel →
          </button>
        )}
      </div>
    )
  }

  // ─── Computing ───
  if (phase === 'computing') {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
        <div className="relative">
          <div className="h-20 w-20 animate-spin rounded-full border-4 border-accent/20 border-t-accent" />
          <span className="absolute inset-0 flex items-center justify-center text-3xl">🧬</span>
        </div>
        <p className="mt-6 text-lg font-bold text-text-primary animate-pulse">
          Analyse de ton ADN culturel...
        </p>
        <p className="mt-2 text-sm text-text-muted">
          On croise tes réponses avec 8 dimensions de personnalité
        </p>
      </div>
    )
  }

  // ─── Result ───
  if (phase === 'result' && profile) {
    const archetype = ARCHETYPES[profile.archetype] || ARCHETYPES['flaneur-curieux']
    const dimensions = [
      'exploration', 'energy', 'social', 'budget',
      'planning', 'mainstream', 'visual', 'depth',
    ] as const

    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        {/* XP toast */}
        {xpAwarded > 0 && (
          <div className="mb-6 flex items-center justify-center gap-2 rounded-xl bg-free/10 px-4 py-2.5 text-[13px] font-bold text-free animate-bounce-in">
            <Zap className="h-4 w-4" />
            +{xpAwarded} XP gagnés !
          </div>
        )}

        {/* Archetype card */}
        <div
          className="rounded-3xl p-6 text-center text-white shadow-xl"
          style={{ background: `linear-gradient(135deg, ${archetype.color}, ${archetype.color}dd)` }}
        >
          <span className="text-5xl">{archetype.emoji}</span>
          <h2 className="mt-4 text-2xl font-black">{archetype.name}</h2>
          <p className="mt-2 text-sm font-medium opacity-90">{archetype.tagline}</p>
          <p className="mt-4 text-[13px] leading-relaxed opacity-80">{archetype.description}</p>

          {/* Traits */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {archetype.traits.map(t => (
              <span key={t} className="rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold backdrop-blur-sm">
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Dimension bars */}
        <div className="mt-8">
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-text-muted">
            Tes 8 dimensions
          </h3>
          <div className="mt-4 space-y-3">
            {dimensions.map(dim => {
              const val = profile[dim]
              const label = DIMENSION_LABELS[dim]
              return (
                <div key={dim}>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-text-secondary">
                      {label.icon} {label.low}
                    </span>
                    <span className="font-medium text-text-secondary">
                      {label.high}
                    </span>
                  </div>
                  <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-surface-hover">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${val}%`,
                        background: `linear-gradient(90deg, ${archetype.color}88, ${archetype.color})`,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Recommendations */}
        <div className="mt-8">
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-text-muted">
            On te recommande
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {archetype.recommendations.map(rec => (
              <span
                key={rec}
                className="rounded-xl border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-primary"
              >
                {rec}
              </span>
            ))}
          </div>
        </div>

        {/* AI Summary */}
        {profile.aiSummary && (
          <div className="mt-6 rounded-2xl bg-surface-hover/50 p-4">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-accent">
              <Sparkles className="h-3.5 w-3.5" /> Résumé IA
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
              {profile.aiSummary}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-8 space-y-3">
          <button
            onClick={startQuiz}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-[13px] font-semibold text-text-secondary hover:bg-surface-hover transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Refaire le quiz
          </button>
          <Link
            href="/match"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-[13px] font-bold text-white"
          >
            <Sparkles className="h-4 w-4" />
            Découvrir mes matchs
          </Link>
        </div>
      </div>
    )
  }

  // ─── Playing ───
  if (!currentQuestion) return null

  // Detect category transition
  const prevCategory = currentIndex > 0 ? QUIZ_QUESTIONS[currentIndex - 1].category : null
  const isNewCategory = currentQuestion.category !== prevCategory

  return (
    <div ref={containerRef} className="mx-auto max-w-lg px-4 py-6">
      {/* Progress */}
      <div className="mb-2 flex items-center justify-between text-[11px] text-text-muted">
        <span className="font-semibold">{currentIndex + 1}/{QUIZ_QUESTIONS.length}</span>
        <span>{currentCategory?.icon} {currentCategory?.title}</span>
      </div>
      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-neon transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Category transition */}
      {isNewCategory && currentCategory && (
        <div
          className="mb-6 rounded-2xl px-4 py-3 text-center animate-fade-in"
          style={{ backgroundColor: `${currentCategory.color}10` }}
        >
          <span className="text-2xl">{currentCategory.icon}</span>
          <p className="mt-1 text-[13px] font-bold" style={{ color: currentCategory.color }}>
            {currentCategory.title}
          </p>
          <p className="text-[11px] text-text-muted">{currentCategory.subtitle}</p>
        </div>
      )}

      {/* Question */}
      <p className="mb-6 text-center text-lg font-black text-text-primary">
        Tu préfères...
      </p>

      {/* Options */}
      <div className="flex flex-col gap-3">
        {/* Option A */}
        <button
          onClick={() => handleAnswer('a')}
          disabled={animating}
          className={cn(
            'group relative overflow-hidden rounded-2xl border-2 p-5 text-left transition-all duration-300',
            selectedSide === 'a'
              ? 'border-accent bg-accent/5 scale-[1.02] shadow-lg shadow-accent/10'
              : selectedSide === 'b'
              ? 'border-border/30 opacity-40 scale-[0.97]'
              : 'border-border/60 bg-surface hover:border-accent/40 hover:shadow-md active:scale-[0.98]',
          )}
        >
          <div className="flex items-start gap-3">
            <span className="text-3xl">{currentQuestion.optionA.emoji}</span>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-text-primary leading-snug">
                {currentQuestion.optionA.text}
              </p>
              {currentQuestion.optionA.subtext && (
                <p className="mt-1 text-[12px] text-text-muted italic">
                  {currentQuestion.optionA.subtext}
                </p>
              )}
            </div>
          </div>
          {selectedSide === 'a' && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white animate-scale-in">
              ✓
            </div>
          )}
        </button>

        {/* VS divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[12px] font-black text-text-muted">OU</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Option B */}
        <button
          onClick={() => handleAnswer('b')}
          disabled={animating}
          className={cn(
            'group relative overflow-hidden rounded-2xl border-2 p-5 text-left transition-all duration-300',
            selectedSide === 'b'
              ? 'border-accent bg-accent/5 scale-[1.02] shadow-lg shadow-accent/10'
              : selectedSide === 'a'
              ? 'border-border/30 opacity-40 scale-[0.97]'
              : 'border-border/60 bg-surface hover:border-accent/40 hover:shadow-md active:scale-[0.98]',
          )}
        >
          <div className="flex items-start gap-3">
            <span className="text-3xl">{currentQuestion.optionB.emoji}</span>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-text-primary leading-snug">
                {currentQuestion.optionB.text}
              </p>
              {currentQuestion.optionB.subtext && (
                <p className="mt-1 text-[12px] text-text-muted italic">
                  {currentQuestion.optionB.subtext}
                </p>
              )}
            </div>
          </div>
          {selectedSide === 'b' && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white animate-scale-in">
              ✓
            </div>
          )}
        </button>
      </div>

      {/* Skip hint */}
      <p className="mt-4 text-center text-[11px] text-text-muted">
        Fais confiance à ton premier instinct 💡
      </p>
    </div>
  )
}
