import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-border bg-primary pb-20 pt-10 md:pb-8">
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <p className="text-lg font-black text-white">
              PANAME <span className="font-light text-accent-glow">CLUB</span>
            </p>
            <p className="mt-2 text-sm text-white/40">
              Toute la culture parisienne en un clic.
            </p>
          </div>

          {/* Discover */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white/60">Découvrir</h3>
            <ul className="mt-3 space-y-2 text-sm text-white/40">
              <li><Link href="/ce-soir" className="hover:text-white transition-colors">Ce soir</Link></li>
              <li><Link href="/evenements?date=weekend" className="hover:text-white transition-colors">Ce week-end</Link></li>
              <li><Link href="/evenements?free=true" className="hover:text-white transition-colors">Gratuit</Link></li>
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white/60">Catégories</h3>
            <ul className="mt-3 space-y-2 text-sm text-white/40">
              <li><Link href="/categories/concerts" className="hover:text-white transition-colors">Concerts</Link></li>
              <li><Link href="/categories/expos" className="hover:text-white transition-colors">Expositions</Link></li>
              <li><Link href="/categories/theatre" className="hover:text-white transition-colors">Théâtre</Link></li>
              <li><Link href="/categories/cinema" className="hover:text-white transition-colors">Cinéma</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white/60">Infos</h3>
            <ul className="mt-3 space-y-2 text-sm text-white/40">
              <li><Link href="/a-propos" className="hover:text-white transition-colors">À propos</Link></li>
              <li><Link href="/contact" className="hover:text-white transition-colors">Contact</Link></li>
              <li><Link href="/cgu" className="hover:text-white transition-colors">CGU</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex items-center justify-between border-t border-white/10 pt-6">
          <p className="text-xs text-white/30">
            &copy; {new Date().getFullYear()} Paname Club. Fait avec amour depuis Paris.
          </p>
        </div>
      </div>
    </footer>
  )
}
