'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, RotateCcw, Share2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_BY_SLUG } from '@/lib/events/taxonomy'
import {
  ARCHETYPES,
  ARCHETYPE_AFFINITIES,
  DIMENSION_LABELS,
  DIMENSIONS,
  QUICK_QUESTION_IDS,
  QUIZ_CATEGORIES,
  QUIZ_QUESTIONS,
  scoreQuiz,
  type QuizAnswer,
  type QuizAnswers,
  type TasteScores,
} from '@/lib/taste-quiz-data'
import { cn } from '@/lib/utils'
import { readLocalQuiz, writeLocalQuiz } from '@/app/club/_lib/local'

type Phase = 'loading' | 'intro' | 'playing' | 'result'

interface Result {
  archetype: string
  scores: TasteScores
  answered: number
}

const QUESTION_BY_ID = new Map(QUIZ_QUESTIONS.map((q) => [q.id, q]))

export function QuizGame() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [loggedIn, setLoggedIn] = useState(false)
  const [answers, setAnswers] = useState<QuizAnswers>({})
  const [queue, setQueue] = useState<string[]>([])
  const [position, setPosition] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [picked, setPicked] = useState<QuizAnswer | null>(null)
  const [replace, setReplace] = useState(false)

  // Restore: account first, then this device.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let restored: { answers: QuizAnswers; result: Result } | null = null
      try {
        const { data } = await createClient().auth.getSession()
        const logged = Boolean(data.session)
        if (!cancelled) setLoggedIn(logged)
        if (logged) {
          const res = await fetch('/api/taste-quiz', { cache: 'no-store' })
          if (res.ok) {
            const d = (await res.json()) as {
              completed: boolean
              profile: { archetype: string; scores: TasteScores } | null
              answers: QuizAnswers
            }
            if (d.completed && d.profile) {
              restored = {
                answers: d.answers ?? {},
                result: { archetype: d.profile.archetype, scores: d.profile.scores, answered: Object.keys(d.answers ?? {}).length },
              }
            }
          }
        }
      } catch {
        // offline / no session: fall back to local
      }
      if (!restored) {
        const local = readLocalQuiz()
        if (local) {
          restored = {
            answers: local.answers,
            result: { archetype: local.archetype, scores: local.scores, answered: Object.keys(local.answers).length },
          }
        }
      }
      if (cancelled) return
      if (restored) {
        setAnswers(restored.answers)
        setResult(restored.result)
        setPhase('result')
      } else {
        setPhase('intro')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const start = useCallback(
    (mode: 'quick' | 'more' | 'restart') => {
      const base = mode === 'restart' ? {} : answers
      const ids =
        mode === 'more' ? QUIZ_QUESTIONS.map((q) => q.id).filter((id) => !(id in base)) : QUICK_QUESTION_IDS.filter((id) => !(id in base))
      if (mode === 'restart') setAnswers({})
      setReplace(mode === 'restart')
      setQueue(ids.length ? ids : QUICK_QUESTION_IDS)
      setPosition(0)
      setSaveState('idle')
      setPhase('playing')
    },
    [answers]
  )

  const finish = useCallback(
    async (all: QuizAnswers) => {
      const r = scoreQuiz(all)
      const res: Result = { archetype: r.archetype, scores: r.scores, answered: r.answered }
      setResult(res)
      setPhase('result')
      writeLocalQuiz({ answers: all, archetype: r.archetype, scores: r.scores, at: new Date().toISOString(), synced: false })
      if (!loggedIn) return
      setSaveState('saving')
      try {
        const resp = await fetch('/api/taste-quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: all, replace }),
        })
        if (!resp.ok) throw new Error(String(resp.status))
        writeLocalQuiz({ answers: all, archetype: r.archetype, scores: r.scores, at: new Date().toISOString(), synced: true })
        setSaveState('saved')
      } catch {
        setSaveState('error')
      }
    },
    [loggedIn, replace]
  )

  const answer = useCallback(
    (choice: QuizAnswer) => {
      const id = queue[position]
      if (!id || picked) return
      setPicked(choice)
      const next = { ...answers, [id]: choice }
      setAnswers(next)
      window.setTimeout(() => {
        setPicked(null)
        if (position + 1 >= queue.length) finish(next)
        else setPosition((p) => p + 1)
      }, 180)
    },
    [answers, finish, picked, position, queue]
  )

  // Keyboard: A / ← and B / →
  useEffect(() => {
    if (phase !== 'playing') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') answer('a')
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'b') answer('b')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [answer, phase])

  if (phase === 'loading') {
    return <div className="skeleton mx-auto mt-8 h-72 max-w-xl rounded-2xl" aria-busy="true" />
  }

  if (phase === 'intro') {
    return (
      <div className="mx-auto mt-8 max-w-xl rounded-2xl bg-night p-6 text-paper sm:p-8">
        <p className="font-display text-[2.4rem]">10 duels, 2 minutes.</p>
        <p className="mt-3 text-[16px] leading-relaxed text-paper/80">
          Concert en cave ou festival géant ? Vernissage confidentiel ou soirée d’ouverture ? Choisis à l’instinct : on en
          déduit ton profil de sortant parisien, et ton Drop du lundi s’y adapte.
        </p>
        <button
          type="button"
          onClick={() => start('quick')}
          className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-paper px-6 text-[15px] font-semibold text-ink transition-colors hover:bg-accent-soft"
        >
          C’est parti
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
        <p className="mt-3 text-[13px] text-paper/70">Sans compte. Tu pourras affiner avec 30 questions de plus.</p>
      </div>
    )
  }

  if (phase === 'playing') {
    const q = QUESTION_BY_ID.get(queue[position])
    if (!q) return null
    const cat = QUIZ_CATEGORIES.find((c) => c.id === q.category)
    const progress = Math.round((position / queue.length) * 100)
    return (
      <div className="mx-auto mt-8 max-w-2xl">
        <div className="flex items-center justify-between gap-3 text-[13px] font-semibold text-text-muted">
          <button
            type="button"
            onClick={() => setPosition((p) => Math.max(0, p - 1))}
            disabled={position === 0}
            className="inline-flex h-11 items-center gap-1 rounded-full px-2 hover:text-ink disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Précédente
          </button>
          <span className="tabular-nums" aria-live="polite">
            {position + 1} / {queue.length}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-deep" aria-hidden>
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>

        <p className="mt-8 text-center text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">{cat?.title}</p>
        <h2 className="font-display mt-2 text-center text-[2.6rem] text-ink">Tu préfères…</h2>

        <div className="mt-6 grid gap-3 sm:grid-cols-2" role="group" aria-label="Choisis une option">
          {(['a', 'b'] as const).map((side) => {
            const opt = side === 'a' ? q.optionA : q.optionB
            const selected = picked === side || (!picked && answers[q.id] === side)
            return (
              <button
                key={side}
                type="button"
                onClick={() => answer(side)}
                aria-pressed={selected}
                className={cn(
                  'flex min-h-[148px] flex-col items-start rounded-2xl border-2 p-5 text-left transition-colors',
                  selected ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:border-ink'
                )}
              >
                <span className="text-[13px] font-bold uppercase text-text-muted">
                  {side === 'a' ? 'A · ←' : 'B · →'}
                </span>
                <span className="mt-2 text-[18px] font-semibold leading-snug text-ink">
                  <span aria-hidden className="mr-1.5">
                    {opt.emoji}
                  </span>
                  {opt.text}
                </span>
                {opt.subtext && <span className="mt-1 text-[14px] text-text-secondary">{opt.subtext}</span>}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // Result
  if (!result) return null
  const arch = ARCHETYPES[result.archetype] ?? ARCHETYPES['flaneur-curieux']
  const affinity = ARCHETYPE_AFFINITIES[arch.slug]
  const canRefine = result.answered < QUIZ_QUESTIONS.length

  return (
    <div className="mx-auto mt-8 max-w-3xl">
      <section className="rounded-2xl bg-night p-6 text-paper sm:p-8" aria-labelledby="result-title">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent-glow">Ton profil culturel</p>
        <h2 id="result-title" className="font-display mt-2 text-[3rem] sm:text-[3.8rem]">
          {arch.name} <span aria-hidden className="text-[2rem] align-middle">{arch.emoji}</span>
        </h2>
        <p className="mt-1 text-[18px] font-semibold text-accent-glow">{arch.tagline}</p>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-paper/85">{arch.description}</p>
        <ul className="mt-5 flex flex-wrap gap-2">
          {arch.traits.map((t) => (
            <li key={t} className="rounded-full border border-paper/25 px-3 py-1 text-[13px] text-paper/90">
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[13px] text-paper/70">
          Basé sur {result.answered} réponse{result.answered > 1 ? 's' : ''}.
          {saveState === 'saving' && ' Enregistrement…'}
          {saveState === 'saved' && ' Enregistré sur ton compte.'}
          {saveState === 'error' && ' Pas pu l’enregistrer pour l’instant, on réessaiera.'}
        </p>
      </section>

      <section className="mt-8" aria-labelledby="dims-title">
        <h3 id="dims-title" className="font-display text-[1.8rem] text-ink">
          Ton équilibre
        </h3>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {DIMENSIONS.map((d) => {
            const meta = DIMENSION_LABELS[d]
            const v = result.scores[d]
            return (
              <li key={d}>
                <div className="flex justify-between text-[13px] text-text-secondary">
                  <span>{meta.low}</span>
                  <span className="font-semibold text-ink">{meta.label}</span>
                  <span>{meta.high}</span>
                </div>
                <div className="relative mt-1.5 h-2 rounded-full bg-paper-deep" role="img" aria-label={`${meta.label} : ${v} sur 100`}>
                  <span
                    className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-accent shadow-sm"
                    style={{ left: `${v}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="mt-8 rounded-2xl border border-border bg-surface p-5" aria-labelledby="next-title">
        <h3 id="next-title" className="font-display text-[1.8rem] text-ink">
          Ce qu’on va te proposer
        </h3>
        <ul className="mt-3 flex flex-wrap gap-2">
          {affinity?.categories.map((slug) => (
            <li key={slug}>
              <Link
                href={`/categories/${slug}`}
                className="inline-flex h-11 items-center rounded-full border border-border-strong px-4 text-[14px] font-semibold text-ink hover:border-ink"
              >
                {CATEGORY_BY_SLUG[slug]?.plural ?? slug}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link href="/drop" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-paper">
            Voir mon Drop de la semaine
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href="/match"
            className="inline-flex h-12 items-center justify-center rounded-full border border-border-strong px-5 text-[15px] font-semibold text-ink hover:border-ink"
          >
            Affiner avec Match
          </Link>
        </div>
        {!loggedIn && (
          <p className="mt-4 text-[14px] text-text-secondary">
            Ton profil est gardé sur cet appareil.{' '}
            <Link href="/login?next=/quiz" className="font-semibold text-accent underline underline-offset-2">
              Crée ton compte
            </Link>{' '}
            pour le retrouver partout et recevoir ton Drop perso.
          </p>
        )}
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        {canRefine && (
          <button
            type="button"
            onClick={() => start('more')}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[14px] font-semibold text-paper hover:bg-accent-hover"
          >
            <Check className="h-4 w-4" aria-hidden />
            Affiner ({QUIZ_QUESTIONS.length - result.answered} questions de plus)
          </button>
        )}
        <ShareButton name={arch.name} />
        <button
          type="button"
          onClick={() => start('restart')}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-border-strong px-4 text-[14px] font-semibold text-ink hover:border-ink"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Recommencer
        </button>
      </div>
    </div>
  )
}

function ShareButton({ name }: { name: string }) {
  const [copied, setCopied] = useState(false)
  const text = useMemo(() => `Je suis « ${name} » sur Paname Club. Et toi ?`, [name])
  const share = async () => {
    const url = `${window.location.origin}/quiz`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Tu préfères', text, url })
        return
      }
      await navigator.clipboard.writeText(`${text} ${url}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // share cancelled
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex h-11 items-center gap-2 rounded-full border border-border-strong px-4 text-[14px] font-semibold text-ink hover:border-ink"
    >
      <Share2 className="h-4 w-4" aria-hidden />
      {copied ? 'Lien copié' : 'Partager'}
    </button>
  )
}
