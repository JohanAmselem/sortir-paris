'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Compass, MapPin, Bookmark, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/', label: 'Accueil', icon: Home },
  { href: '/evenements', label: 'Explorer', icon: Compass },
  { href: '/carte', label: 'Carte', icon: MapPin },
  { href: '/compte/sauvegardes', label: 'Favoris', icon: Bookmark },
  { href: '/compte', label: 'Profil', icon: User },
] as const

export function BottomNav() {
  const pathname = usePathname()

  // Hide on login/onboarding pages
  if (pathname === '/login' || pathname === '/onboarding') return null

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/40 bg-white/90 backdrop-blur-xl md:hidden safe-area-bottom">
      <div className="flex h-14 items-center justify-around px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== '/' && href.length > 1 && pathname.startsWith(href + '/'))

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-4 py-1 transition-colors',
                isActive ? 'text-accent' : 'text-text-muted'
              )}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.5 : 1.5} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
