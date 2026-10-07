import Link from 'next/link'
import { Search } from 'lucide-react'
import { HeaderNav } from './header-nav'
import { HeaderAuth } from './header-auth'

export const PRIMARY_NAV = [
  { href: '/ce-soir', label: 'Ce soir' },
  { href: '/ce-week-end', label: 'Ce week-end' },
  { href: '/gratuit', label: 'Gratuit' },
  { href: '/carte', label: 'Carte' },
  { href: '/evenements', label: 'Explorer' },
  { href: '/club', label: 'Le Club' },
]

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link href="/" aria-label="Paname Club, accueil" className={`flex items-baseline gap-[0.2em] ${className}`}>
      <span className="font-display text-[1.35rem] tracking-tight text-ink">PANAME</span>
      <span className="font-display text-[1.35rem] font-light tracking-tight text-accent">CLUB</span>
    </Link>
  )
}

export function Header() {
  return (
    <header className="glass sticky top-0 z-40 border-b border-border/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Logo className="shrink-0" />
        <HeaderNav items={PRIMARY_NAV} />
        <div className="flex-1" />
        <Link
          href="/evenements"
          className="flex h-10 w-10 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover hover:text-ink md:h-9 md:w-auto md:gap-2 md:border md:border-border md:bg-surface md:px-3 md:text-[13px]"
        >
          <Search className="h-[18px] w-[18px] md:h-4 md:w-4" aria-hidden />
          <span className="sr-only md:not-sr-only">Rechercher</span>
        </Link>
        <HeaderAuth />
      </div>
    </header>
  )
}
