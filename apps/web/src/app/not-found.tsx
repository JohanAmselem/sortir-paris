import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-7xl">🏙️</p>
      <h1 className="mt-6 text-2xl font-bold text-text-primary">
        Perdu dans Paris ?
      </h1>
      <p className="mt-2 max-w-sm text-sm text-text-secondary">
        Cette page n&apos;existe pas ou a été déplacée. Pas de panique, il y a plein de choses à découvrir.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/"
          className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-accent/90 transition-all"
        >
          Retour à l&apos;accueil
        </Link>
        <Link
          href="/evenements"
          className="rounded-xl border border-border px-6 py-3 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-all"
        >
          Explorer
        </Link>
      </div>
    </div>
  )
}
