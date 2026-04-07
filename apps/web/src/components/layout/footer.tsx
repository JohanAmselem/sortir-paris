import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-border bg-primary pb-20 pt-12 md:pb-10">
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <p className="text-[17px] font-black text-white">
              PANAME<span className="font-extralight text-accent-glow">CLUB</span>
            </p>
            <p className="mt-3 max-w-[200px] text-[13px] leading-relaxed text-white/30">
              L&apos;IA culturelle qui te trouve ton meilleur plan pour ce soir.
            </p>
          </div>

          {/* Discover */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/40">Découvrir</h3>
            <ul className="mt-4 space-y-2.5">
              {[
                { href: '/ce-soir', label: 'Ce soir' },
                { href: '/ce-week-end', label: 'Ce week-end' },
                { href: '/gratuit', label: 'Gratuit' },
                { href: '/evenements', label: 'Tous les événements' },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-[13px] text-white/30 hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/40">Catégories</h3>
            <ul className="mt-4 space-y-2.5">
              {[
                { href: '/categories/concerts', label: 'Concerts' },
                { href: '/categories/expos', label: 'Expositions' },
                { href: '/categories/theatre', label: 'Théâtre' },
                { href: '/categories/cinema', label: 'Cinéma' },
                { href: '/categories/festivals', label: 'Festivals' },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-[13px] text-white/30 hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Info */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/40">Infos</h3>
            <ul className="mt-4 space-y-2.5">
              {[
                { href: '/news', label: 'News culturelles' },
                { href: '/collections', label: 'Collections' },
                { href: '/lieux', label: 'Lieux' },
                { href: '/surprise', label: 'Surprise moi' },
                { href: '/carte', label: 'Carte interactive' },
                { href: '/newsletter', label: 'Newsletter' },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-[13px] text-white/30 hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/5 pt-6">
          <p className="text-[11px] text-white/20">
            &copy; {new Date().getFullYear()} Paname Club. Fait avec amour depuis Paris.
          </p>
        </div>
      </div>
    </footer>
  )
}
