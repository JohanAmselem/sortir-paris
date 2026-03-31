'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '/ce-soir', label: 'Ce soir' },
  { href: '/evenements?date=weekend', label: 'Week-end' },
  { href: '/evenements?free=true', label: 'Gratuit' },
  { href: '/categories/concerts', label: 'Concerts' },
  { href: '/categories/expos', label: 'Expos' },
]

export function Header() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-surface/90 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        {/* Logo */}
        <Link href="/" className="flex items-baseline gap-1 flex-shrink-0">
          <span className="text-lg font-black tracking-tight text-primary">PANAME</span>
          <span className="text-lg font-light tracking-tight text-accent">CLUB</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-0.5 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all',
                pathname === link.href
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Auth */}
        <Link
          href="/login"
          className="flex-shrink-0 rounded-full bg-primary px-5 py-2 text-[13px] font-semibold text-white hover:bg-primary-hover transition-all"
        >
          Se connecter
        </Link>
      </div>
    </header>
  )
}
