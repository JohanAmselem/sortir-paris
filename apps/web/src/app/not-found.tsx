import Link from 'next/link'
import { SearchBox } from '@/components/search/search-box'

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4">
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">Erreur 404</p>
      <h1 className="font-display mt-1 text-[3.2rem] text-ink">Perdu dans Paris ?</h1>
      <p className="mt-3 text-[16px] text-text-secondary">
        Cette page n’existe pas, ou l’événement a été retiré par son organisateur.
      </p>
      <SearchBox className="mt-6" />
      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { href: '/ce-soir', label: 'Ce soir' },
          { href: '/ce-week-end', label: 'Ce week-end' },
          { href: '/carte', label: 'La carte' },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="inline-flex h-11 items-center rounded-full border border-border-strong bg-surface px-4 text-[15px] font-semibold text-ink hover:border-ink">
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
