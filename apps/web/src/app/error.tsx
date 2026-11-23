'use client'

import Link from 'next/link'
import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[page error]', error.digest ?? error.message)
  }, [error])

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4">
      <p className="t-micro font-semibold text-neon">Petit contretemps</p>
      <h1 className="t-display mt-1 text-ink">Cette page n’a pas pu se charger</h1>
      <p className="t-body mt-3 text-text-secondary">
        Nos sources mettent parfois quelques secondes à répondre. Réessaie, ou repars d’une autre entrée.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={reset} className="t-body h-12 rounded-full bg-ink px-6 font-semibold text-paper">
          Réessayer
        </button>
        <Link href="/" className="t-body inline-flex h-12 items-center rounded-full border border-border-strong px-6 font-semibold text-ink">
          Accueil
        </Link>
      </div>
      {error.digest && <p className="t-small mt-6 text-text-muted">Référence : {error.digest}</p>}
    </div>
  )
}
