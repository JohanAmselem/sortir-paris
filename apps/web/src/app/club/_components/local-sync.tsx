'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { markSwipesSynced, readLocalQuiz, readLocalSwipes, writeLocalQuiz } from '../_lib/local'
import { MATCH_IMPORT_MAX } from '../_lib/deck'

/**
 * Once logged in, pushes what was played anonymously (quiz result, swipes)
 * to the account. Silent and idempotent; renders nothing.
 */
export function LocalSync({ onSynced }: { onSynced?: () => void }) {
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await createClient().auth.getSession()
        if (!data.session || cancelled) return
        let changed = false

        const quiz = readLocalQuiz()
        if (quiz && !quiz.synced) {
          const res = await fetch('/api/taste-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers: quiz.answers }),
          })
          if (res.ok) {
            writeLocalQuiz({ ...quiz, synced: true })
            changed = true
          }
        }

        const pending = readLocalSwipes()
          .filter((s) => !s.synced)
          .slice(-MATCH_IMPORT_MAX)
        if (pending.length) {
          const res = await fetch('/api/swipe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ swipes: pending.map(({ eventId, direction }) => ({ eventId, direction })) }),
          })
          // 404: none of these events exist anymore. Either way, don't retry forever.
          if (res.ok || res.status === 404 || res.status === 400) {
            markSwipesSynced(pending.map((s) => s.eventId))
            changed = res.ok
          }
        }
        if (changed && !cancelled) onSynced?.()
      } catch {
        // offline: retried on next visit
      }
    })()
    return () => {
      cancelled = true
    }
  }, [onSynced])
  return null
}
