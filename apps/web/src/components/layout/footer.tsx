import Link from 'next/link'

export function Footer() {
  return (
    <footer className="mt-16 hidden border-t border-border bg-surface pb-4 pt-10 md:block">
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <p className="text-lg font-bold text-primary">Sortir</p>
            <p className="mt-2 text-sm text-text-secondary">
              Tous les événements culturels à Paris en un seul endroit.
            </p>
          </div>

          {/* Discover */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Découvrir</h3>
            <ul className="mt-3 space-y-2 text-sm text-text-secondary">
              <li><Link href="/ce-soir" className="hover:text-text-primary">Ce soir</Link></li>
              <li><Link href="/ce-week-end" className="hover:text-text-primary">Ce week-end</Link></li>
              <li><Link href="/gratuit" className="hover:text-text-primary">Gratuit</Link></li>
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Catégories</h3>
            <ul className="mt-3 space-y-2 text-sm text-text-secondary">
              <li><Link href="/categories/concerts" className="hover:text-text-primary">Concerts</Link></li>
              <li><Link href="/categories/expos" className="hover:text-text-primary">Expositions</Link></li>
              <li><Link href="/categories/theatre" className="hover:text-text-primary">Théâtre</Link></li>
              <li><Link href="/categories/cinema" className="hover:text-text-primary">Cinéma</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Sortir</h3>
            <ul className="mt-3 space-y-2 text-sm text-text-secondary">
              <li><Link href="/a-propos" className="hover:text-text-primary">À propos</Link></li>
              <li><Link href="/contact" className="hover:text-text-primary">Contact</Link></li>
              <li><Link href="/cgu" className="hover:text-text-primary">CGU</Link></li>
            </ul>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-text-muted">
          &copy; {new Date().getFullYear()} Sortir. Tous droits réservés.
        </p>
      </div>
    </footer>
  )
}
