import { Metadata } from 'next'
import Link from 'next/link'
import { Bookmark, Settings, LogOut } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Mon compte',
}

export default function ComptePage() {
  return (
    <div className="px-4 py-8">
      <h1 className="text-2xl font-bold text-text-primary">Mon compte</h1>
      <p className="mt-1 text-sm text-text-muted">
        Connectez-vous pour sauvegarder vos événements favoris.
      </p>

      <div className="mt-8 space-y-3">
        <Link
          href="/compte/sauvegardes"
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-all hover:shadow-md"
        >
          <Bookmark className="h-5 w-5 text-accent" />
          <div>
            <p className="font-semibold text-text-primary">Mes favoris</p>
            <p className="text-sm text-text-muted">Événements sauvegardés</p>
          </div>
        </Link>

        <Link
          href="/login"
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-all hover:shadow-md"
        >
          <Settings className="h-5 w-5 text-text-muted" />
          <div>
            <p className="font-semibold text-text-primary">Se connecter</p>
            <p className="text-sm text-text-muted">Google ou lien magique</p>
          </div>
        </Link>
      </div>
    </div>
  )
}
