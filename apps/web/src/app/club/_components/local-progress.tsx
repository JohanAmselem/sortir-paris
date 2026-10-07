'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ARCHETYPES } from '@/lib/taste-quiz-data'
import { readLocalQuiz, readLocalSwipes } from '../_lib/local'

/** Anonymous visitor: what they already played on this device, or what the Club gives. */
export function LocalProgress() {
  const [state, setState] = useState<{ archetype: string | null; swipes: number; likes: number } | null>(null)

  useEffect(() => {
    const quiz = readLocalQuiz()
    const swipes = readLocalSwipes()
    setState({
      archetype: quiz?.archetype ?? null,
      swipes: swipes.length,
      likes: swipes.filter((s) => s.direction === 'right').length,
    })
  }, [])

  const played = state && (state.archetype || state.swipes > 0)
  const archetype = state?.archetype ? ARCHETYPES[state.archetype] : null

  return (
    <section aria-label="Ce que le Club t’apporte" className="rounded-2xl bg-night p-5 text-paper sm:p-6">
      {played ? (
        <>
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent-glow">Sur cet appareil</p>
          <p className="font-display mt-2 text-[2rem]">
            {archetype ? `Tu es ${archetype.name}` : `${state.swipes} swipes, ${state.likes} coups de cœur`}
          </p>
          <p className="mt-2 text-[15px] text-paper/80">
            {archetype && state.swipes > 0 ? `${state.swipes} swipes, ${state.likes} coups de cœur. ` : ''}
            Crée ton compte pour les garder et recevoir ton Drop personnalisé chaque lundi.
          </p>
          <Link
            href="/login?next=/club"
            className="mt-4 inline-flex h-11 items-center rounded-full bg-paper px-4 text-[14px] font-semibold text-ink transition-colors hover:bg-accent-soft"
          >
            Garder mes résultats
          </Link>
        </>
      ) : (
        <>
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent-glow">Avec le Club</p>
          <ul className="mt-3 space-y-3 text-[15px]">
            <li>
              <strong className="font-semibold">Des idées qui te ressemblent.</strong>{' '}
              <span className="text-paper/80">Chaque swipe et chaque réponse affinent tes recommandations.</span>
            </li>
            <li>
              <strong className="font-semibold">5 sorties chaque lundi.</strong>{' '}
              <span className="text-paper/80">Avec la raison de chaque choix, pas un algorithme opaque.</span>
            </li>
            <li>
              <strong className="font-semibold">Des badges et des niveaux.</strong>{' '}
              <span className="text-paper/80">Gagnés en sortant vraiment, pas en cliquant.</span>
            </li>
          </ul>
        </>
      )}
    </section>
  )
}
