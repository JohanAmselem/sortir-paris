'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { User as SupabaseUser } from '@supabase/supabase-js'

const NAV_LINKS = [
  { href: '/ce-soir', label: 'Ce soir' },
  { href: '/ce-week-end', label: 'Week-end' },
  { href: '/gratuit', label: 'Gratuit' },
  { href: '/carte', label: 'Carte' },
  { href: '/evenements', label: 'Explorer' },
  { href: '/match', label: '❤️ Match' },
  { href: '/drop', label: '🔥 Drop' },
  { href: '/top', label: '🏆 Top' },
  { href: '/news', label: 'News' },
]

export function Header() {
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Keyboard shortcut "/" to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault()
        const searchInput = document.querySelector<HTMLInputElement>('input[type="search"]')
        if (searchInput) {
          searchInput.focus()
        } else {
          window.location.href = '/evenements'
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const avatarUrl =
    user?.user_metadata?.avatar_url || user?.user_metadata?.picture

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-8 px-4">
        {/* Logo */}
        <Link href="/" className="flex items-baseline gap-0.5 flex-shrink-0">
          <span className="text-[17px] font-black tracking-tight text-primary">PANAME</span>
          <span className="text-[17px] font-extralight tracking-tight text-accent">CLUB</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const linkPath = link.href.split('?')[0]
            const isActive = pathname === linkPath || (linkPath !== '/' && linkPath.length > 1 && pathname.startsWith(linkPath + '/'))
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                )}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search shortcut (desktop) */}
        <Link
          href="/evenements"
          className="hidden items-center gap-2 rounded-lg border border-border bg-surface-hover/50 px-3 py-1.5 text-[13px] text-text-muted transition-colors hover:border-border-strong md:flex"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Rechercher...</span>
          <kbd className="ml-4 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
            /
          </kbd>
        </Link>

        {/* Auth */}
        {!loading && (
          user ? (
            <Link
              href="/compte"
              className="flex flex-shrink-0 items-center gap-2 rounded-lg border border-border/80 bg-surface py-1 pl-1 pr-3 transition-all hover:shadow-sm hover:border-border-strong"
            >
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt=""
                  width={26}
                  height={26}
                  className="rounded-md"
                />
              ) : (
                <div className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-accent/10">
                  <User className="h-3.5 w-3.5 text-accent" />
                </div>
              )}
              <span className="hidden text-[13px] font-medium text-text-primary md:block">
                Mon profil
              </span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="flex-shrink-0 rounded-lg bg-primary px-4 py-1.5 text-[13px] font-semibold text-white transition-all hover:bg-primary-hover active:scale-[0.98]"
            >
              Se connecter
            </Link>
          )
        )}
      </div>
    </header>
  )
}
