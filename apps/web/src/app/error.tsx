'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-7xl">😵</p>
      <h1 className="mt-6 text-2xl font-bold text-text-primary">
        Oups, quelque chose a planté
      </h1>
      <p className="mt-2 max-w-sm text-sm text-text-secondary">
        Pas de panique, ça arrive. Essaie de recharger la page.
      </p>
      <button
        onClick={reset}
        className="mt-8 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-accent/90 transition-all"
      >
        Réessayer
      </button>
    </div>
  )
}
