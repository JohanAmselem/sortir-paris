/**
 * Browser storage for anonymous play (Match swipes, quiz result).
 * Everything is wrapped in try/catch: private mode or blocked storage must
 * never break the games. Synced to the account after login (LocalSync).
 */
import { parisDayStart } from '@/lib/paris-time'
import type { QuizAnswers, TasteScores } from '@/lib/taste-quiz-data'
import type { ClientSignals } from '@/lib/recommendations'

const QUIZ_KEY = 'pc.quiz.v1'
const SWIPES_KEY = 'pc.swipes.v1'
const MAX_SWIPES = 300

export interface LocalQuiz {
  answers: QuizAnswers
  archetype: string
  scores: TasteScores
  at: string
  synced?: boolean
}

export interface LocalSwipe {
  eventId: string
  direction: 'left' | 'right'
  category: string | null
  at: string
  synced?: boolean
}

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full / blocked: the game still works for this session
  }
}

export function readLocalQuiz(): LocalQuiz | null {
  const q = read<LocalQuiz>(QUIZ_KEY)
  return q && typeof q === 'object' && q.answers && q.archetype ? q : null
}

export function writeLocalQuiz(q: LocalQuiz) {
  write(QUIZ_KEY, q)
}

export function readLocalSwipes(): LocalSwipe[] {
  const list = read<LocalSwipe[]>(SWIPES_KEY)
  return Array.isArray(list) ? list.filter((s) => s && typeof s.eventId === 'string') : []
}

export function addLocalSwipe(s: Omit<LocalSwipe, 'at'>) {
  const list = readLocalSwipes().filter((x) => x.eventId !== s.eventId)
  list.push({ ...s, at: new Date().toISOString() })
  write(SWIPES_KEY, list.slice(-MAX_SWIPES))
}

export function markSwipesSynced(ids: string[]) {
  const set = new Set(ids)
  write(
    SWIPES_KEY,
    readLocalSwipes().map((s) => (set.has(s.eventId) ? { ...s, synced: true } : s))
  )
}

export function localSwipesToday(): number {
  const start = parisDayStart().getTime()
  return readLocalSwipes().filter((s) => Date.parse(s.at) >= start).length
}

/** Signals sent to /api/drop for an anonymous personalised drop. */
export function localSignals(): ClientSignals | null {
  const quiz = readLocalQuiz()
  const swipes = readLocalSwipes()
  if (!quiz && swipes.length === 0) return null
  const liked: Record<string, number> = {}
  const disliked: Record<string, number> = {}
  for (const s of swipes) {
    if (!s.category) continue
    const t = s.direction === 'right' ? liked : disliked
    t[s.category] = Math.min((t[s.category] ?? 0) + 1, 100)
  }
  return {
    archetype: quiz?.archetype ?? null,
    scores: quiz?.scores ?? null,
    liked,
    disliked,
    excludeIds: swipes.slice(-300).map((s) => s.eventId),
  }
}
