'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface SavedIds {
  /** null tant qu'on ne sait pas (visiteur ou chargement). */
  ids: Set<string> | null
  set: (id: string, saved: boolean) => void
}

const Ctx = createContext<SavedIds>({ ids: null, set: () => {} })

/**
 * Les sorties gardées du membre, lues une fois par page (GET /api/saves) :
 * chaque bouton « Garder » s'affiche dans le bon état, même dans les listes.
 * Rien n'est demandé aux visiteurs non connectés.
 */
export function SavedIdsProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<Set<string> | null>(null)

  useEffect(() => {
    let cancelled = false
    createClient()
      .auth.getSession()
      .then(async ({ data }) => {
        if (!data.session) return
        const res = await fetch('/api/saves', { cache: 'no-store' })
        if (!res.ok) return
        const body = (await res.json()) as { upcoming: Array<{ id: string }>; past: Array<{ id: string }> }
        if (!cancelled) setIds(new Set([...body.upcoming, ...body.past].map((e) => e.id)))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const set = useCallback((id: string, saved: boolean) => {
    setIds((prev) => {
      const next = new Set(prev ?? [])
      if (saved) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const value = useMemo(() => ({ ids, set }), [ids, set])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useSavedIds = () => useContext(Ctx)
