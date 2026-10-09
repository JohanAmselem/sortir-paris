'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Compass, Map, Sparkles, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/', label: 'Accueil', icon: Home },
  { href: '/evenements', label: 'Explorer', icon: Compass },
  { href: '/carte', label: 'Carte', icon: Map },
  { href: '/club', label: 'Le Club', icon: Sparkles },
  { href: '/compte', label: 'Moi', icon: User },
] as const

const MATCHES: Record<string, string[]> = {
  '/evenements': ['/evenements', '/ce-soir', '/ce-week-end', '/gratuit', '/categories', '/collections', '/paris', '/lieux'],
  '/carte': ['/carte', '/autour-de-moi'],
  '/club': ['/club', '/match', '/drop', '/quiz', '/top', '/surprise'],
  '/compte': ['/compte', '/login', '/onboarding'],
}

export function BottomNav() {
  const pathname = usePathname()
  // The event page has its own action bar (save / share / book).
  if (pathname === '/onboarding' || /^\/evenements\/[^/]+$/.test(pathname)) return null

  return (
    <nav
      aria-label="Navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/[0.97] backdrop-blur-md safe-area-bottom md:hidden"
    >
      <ul className="grid h-16 grid-cols-5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const prefixes = MATCHES[href] ?? [href]
          const active = href === '/' ? pathname === '/' : prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  active ? 'text-accent' : 'text-text-muted'
                )}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
