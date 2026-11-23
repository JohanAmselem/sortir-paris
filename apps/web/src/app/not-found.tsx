import Link from 'next/link'
import { SiteSearch } from '@/components/search/site-search'

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4">
      <p className="t-micro text-accent">Erreur 404</p>
      <h1 className="t-display mt-1 text-ink">Perdu dans Paris ?</h1>
      <p className="t-body mt-3 text-text-secondary">
        Cette page n’existe pas, ou l’événement a été retiré par son organisateur.
      </p>
      <SiteSearch className="mt-6" id="recherche-404" />
      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { href: '/ce-soir', label: 'Ce soir' },
          { href: '/agenda', label: 'L’agenda' },
          { href: '/carte', label: 'La carte' },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="t-body inline-flex h-11 items-center rounded-full border border-border-strong bg-surface px-4 font-semibold text-ink hover:border-ink">
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
