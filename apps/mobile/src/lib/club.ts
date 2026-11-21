/**
 * Le Club (lot A9) : Match, quiz « Tu préfères », Drop, ADN.
 * Mêmes règles que le site (apps/web/src/app/club/_lib/deck.ts) :
 * 30 swipes par jour, invitation à créer un compte après 8 swipes sans compte.
 * Un swipe à droite = « ça me tente » (signal de goût) : il ne garde pas la sortie.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CardEvent, QuizAnswers } from '@/shared'
import { api } from './api'
import { useSession } from './auth'
import { addLocalSwipe, saveLocalQuiz } from './local-store'
import { track } from './analytics'

export const MATCH_DAILY_LIMIT = 30
export const MATCH_SIGNUP_NUDGE_AT = 8

export type SwipeDirection = 'left' | 'right'

interface SwipeResult {
  recorded: number
  swipesToday: number
  remaining: number
  xp: number | null
  newBadges: string[]
}

/** Enregistre un swipe : dans le compte si connecté, sur le téléphone sinon. */
export function useRecordSwipe() {
  const session = useSession()
  return useMutation({
    mutationFn: async ({ event, direction }: { event: CardEvent; direction: SwipeDirection }): Promise<SwipeResult | null> => {
      track('match_swipe', { direction })
      if (!session) {
        addLocalSwipe({ eventId: event.id, direction, category: event.category?.slug ?? null })
        return null
      }
      return api<SwipeResult>('/api/swipe', { method: 'POST', body: { eventId: event.id, direction } })
    },
  })
}

/** Envoie les réponses du quiz (connecté) ou les garde sur le téléphone (sans compte). */
export function useSubmitQuiz() {
  const session = useSession()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ answers, completed }: { answers: QuizAnswers; completed: boolean }) => {
      track('quiz_submit', { answered: Object.keys(answers).length })
      if (!session) {
        saveLocalQuiz(answers, completed)
        return null
      }
      return api<{ success: boolean; newBadges: string[] }>('/api/taste-quiz', { method: 'POST', body: { answers } })
    },
    onSuccess: () => {
      if (!session) return
      qc.invalidateQueries({ queryKey: ['adn'] })
      qc.invalidateQueries({ queryKey: ['club'] })
      qc.invalidateQueries({ queryKey: ['taste-quiz'] })
      qc.invalidateQueries({ queryKey: ['drop'] })
    },
  })
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** « 2026-11-16 » → « Semaine du 16 novembre ». */
export function weekLabel(weekStart: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStart ?? '')
  if (!m) return null
  const day = Number(m[3])
  return `Semaine du ${day === 1 ? '1er' : day} ${MONTHS[Number(m[2]) - 1]}`
}

/** « 2026-03-30T… » → « mars 2026 ». */
export function monthYear(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`
}
