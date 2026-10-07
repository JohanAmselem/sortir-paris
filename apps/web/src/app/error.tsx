'use client'

import Link from 'next/link'
import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[page error]', error.digest ?? error.message)
  }, [error])

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4">
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-neon">Petit contretemps</p>
      <h1 className="font-display mt-1 text-[3rem] text-ink">Cette page n’a pas pu se charger</h1>
      <p className="mt-3 text-[16px] text-text-secondary">
        Nos sources mettent parfois quelques secondes à répondre. Réessaie, ou repars d’une autre entrée.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={reset} className="h-12 rounded-full bg-ink px-6 text-[15px] font-semibold text-paper">
          Réessayer
        </button>
        <Link href="/" className="inline-flex h-12 items-center rounded-full border border-border-strong px-6 text-[15px] font-semibold text-ink">
          Accueil
        </Link>
      </div>
      {error.digest && <p className="mt-6 text-[12px] text-text-muted">Référence : {error.digest}</p>}
    </div>
  )
}
