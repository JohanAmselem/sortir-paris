import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Mes favoris',
}

export default function SauvegardesPage() {
  return (
    <div className="px-4 py-8">
      <h1 className="text-2xl font-bold text-text-primary">Mes favoris</h1>

      <div className="mt-16 text-center">
        <p className="text-5xl">🔖</p>
        <p className="mt-4 text-lg font-semibold text-text-primary">
          Connectez-vous pour voir vos favoris
        </p>
        <p className="mt-1 text-sm text-text-muted">
          Sauvegardez vos événements préférés pour ne rien rater.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
        >
          Se connecter
        </Link>
      </div>
    </div>
  )
}
