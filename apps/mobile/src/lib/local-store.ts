/**
 * Ce que l'appli garde sur le téléphone sans compte : sorties gardées,
 * swipes de Match, réponses au quiz. Tout est repris dans le compte à la
 * connexion (lib/auth.tsx → syncLocalToAccount), comme sur le site.
 */
import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { CardEvent, QuizAnswers } from '@/shared'

export interface LocalSwipe {
  eventId: string
  direction: 'left' | 'right'
  at: string
  category: string | null
}

export interface LocalState {
  /** Sorties gardées sans compte : instantané de la carte, pour les afficher hors-ligne. */
  saves: Record<string, { event: CardEvent; at: string }>
  swipes: LocalSwipe[]
  quiz: { answers: QuizAnswers; completedAt: string | null } | null
  /** Notifications : déjà proposées (on ne redemande pas à chaque lancement). */
  pushAsked: boolean
  onboardingDone: boolean
  /** Avis signalés ou masqués par ce membre (identifiants d'avis). */
  hiddenReviews: string[]
  /** Membres dont on ne veut plus voir les avis (clés anonymes d'auteur). */
  blockedAuthors: string[]
}

const KEY = 'paname-local-v1'
const EMPTY: LocalState = { saves: {}, swipes: [], quiz: null, pushAsked: false, onboardingDone: false, hiddenReviews: [], blockedAuthors: [] }

let state: LocalState = EMPTY
let loaded = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export async function loadLocalState(): Promise<void> {
  if (loaded) return
  try {
    const raw = await AsyncStorage.getItem(KEY)
    if (raw) state = { ...EMPTY, ...(JSON.parse(raw) as Partial<LocalState>) }
  } catch {
    state = EMPTY
  }
  loaded = true
  emit()
}

function set(next: Partial<LocalState>) {
  state = { ...state, ...next }
  emit()
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {})
}

export function getLocalState(): LocalState {
  return state
}

export function useLocalState<T>(select: (s: LocalState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => select(state)
  )
}

// ── Sorties gardées ──────────────────────────────────────────────────────

export function toggleLocalSave(event: CardEvent): boolean {
  const saves = { ...state.saves }
  const saved = !saves[event.id]
  if (saved) saves[event.id] = { event, at: new Date().toISOString() }
  else delete saves[event.id]
  set({ saves })
  return saved
}

export function clearLocalSaves(ids?: string[]) {
  if (!ids) return set({ saves: {} })
  const saves = { ...state.saves }
  for (const id of ids) delete saves[id]
  set({ saves })
}

// ── Match ────────────────────────────────────────────────────────────────

export function addLocalSwipe(s: Omit<LocalSwipe, 'at'>) {
  set({ swipes: [...state.swipes.filter((x) => x.eventId !== s.eventId), { ...s, at: new Date().toISOString() }].slice(-200) })
}

export function localSwipesToday(): number {
  const today = new Date().toDateString()
  return state.swipes.filter((s) => new Date(s.at).toDateString() === today).length
}

export function clearLocalSwipes() {
  set({ swipes: [] })
}

// ── Quiz ─────────────────────────────────────────────────────────────────

export function saveLocalQuiz(answers: QuizAnswers, completed: boolean) {
  set({ quiz: { answers, completedAt: completed ? new Date().toISOString() : (state.quiz?.completedAt ?? null) } })
}

export function clearLocalQuiz() {
  set({ quiz: null })
}

// ── Divers ───────────────────────────────────────────────────────────────

export function markPushAsked() {
  set({ pushAsked: true })
}

export function markOnboardingDone() {
  set({ onboardingDone: true })
}

// ── Avis : signalés et membres masqués ──────────────────────────────────

export function hideReview(reviewId: string) {
  if (!state.hiddenReviews.includes(reviewId)) set({ hiddenReviews: [...state.hiddenReviews, reviewId].slice(-500) })
}

export function blockReviewAuthor(authorKey: string) {
  if (!state.blockedAuthors.includes(authorKey)) set({ blockedAuthors: [...state.blockedAuthors, authorKey].slice(-500) })
}

export function clearHiddenReviews() {
  set({ hiddenReviews: [], blockedAuthors: [] })
}
