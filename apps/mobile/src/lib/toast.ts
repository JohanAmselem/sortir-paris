/**
 * Message bref en bas de l'écran (« Pas de connexion… ») : une action qui
 * échoue ne doit jamais échouer en silence.
 */
import { useSyncExternalStore } from 'react'

let current: { id: number; text: string } | null = null
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function showToast(text: string, ms = 3500) {
  current = { id: Date.now(), text }
  emit()
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    current = null
    emit()
  }, ms)
}

export function useToast() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
}
