'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bookmark, CalendarDays, Map, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Les 4 entrées du site, comme les 4 onglets de l'appli. */
const NAV_ITEMS = [
  { href: '/', label: 'Sortir', icon: Moon },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays },
  { href: '/carte', label: 'Carte', icon: Map },
  { href: '/mes-sorties', label: 'Mes sorties', icon: Bookmark },
] as const

const MATCHES: Record<string, string[]> = {
  '/': ['/ce-soir', '/ce-week-end'],
  '/agenda': ['/agenda', '/gratuit', '/categories', '/paris', '/lieux', '/films', '/oeuvres'],
  '/carte': ['/carte'],
  '/mes-sorties': ['/mes-sorties', '/compte', '/login', '/alertes-concerts'],
}

export function BottomNav() {
  const pathname = usePathname()
  // La fiche a sa propre barre (Garder, Réserver).
  if (/^\/evenements\/[^/]+$/.test(pathname)) return null

  return (
    <nav aria-label="Navigation" className="glass fixed inset-x-0 bottom-0 z-40 border-t border-border safe-area-bottom md:hidden">
      <ul className="grid h-16 grid-cols-4">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const prefixes = MATCHES[href] ?? [href]
          const active = (href === '/' && pathname === '/') || prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  't-micro flex h-full min-h-11 flex-col items-center justify-center gap-1 normal-case tracking-normal transition-colors',
                  active ? 'text-ink' : 'text-text-muted hover:text-ink'
                )}
              >
                <Icon className="h-6 w-6" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
