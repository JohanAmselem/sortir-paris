import Image from 'next/image'
import Link from 'next/link'
import { HeaderNav } from './header-nav'
import { HeaderAuth } from './header-auth'
import { HeaderSearch } from './header-search'

/** En-tête : 4 liens, la recherche et le compte. */
export const PRIMARY_NAV = [
  { href: '/ce-soir', label: 'Ce soir' },
  { href: '/agenda', label: 'Agenda' },
  { href: '/carte', label: 'Carte' },
  { href: '/alertes-concerts', label: 'Alertes concerts' },
]

export function Logo({ className = '' }: { className?: string }) {
  // Fichiers de marque : public/brand (versions claires pour le fond « Nuit »).
  return (
    <Link href="/" aria-label="Paname Club, accueil" className={`flex min-h-11 items-center gap-2 ${className}`}>
      <Image src="/brand/logo-mark-light.svg" alt="" width={29} height={30} priority unoptimized className="h-[28px] w-auto" />
      <Image src="/brand/logo-wordmark-light.svg" alt="" width={146} height={15} priority unoptimized className="h-[12px] w-auto md:h-[14px]" />
    </Link>
  )
}

export function Header() {
  return (
    <header className="glass sticky top-0 z-40 border-b border-border">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 md:h-16 md:gap-6">
        <Logo className="shrink-0" />
        <HeaderNav items={PRIMARY_NAV} />
        <HeaderSearch />
        <HeaderAuth />
      </div>
    </header>
  )
}
