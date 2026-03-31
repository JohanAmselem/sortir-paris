'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { User as SupabaseUser } from '@supabase/supabase-js'

const NAV_LINKS = [
  { href: '/ce-soir', label: 'Ce soir' },
  { href: '/evenements?date=weekend', label: 'Week-end' },
  { href: '/evenements?free=true', label: 'Gratuit' },
  { href: '/categories/concerts', label: 'Concerts' },
  { href: '/categories/expos', label: 'Expos' },
]

export function Header() {
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [loading, setLoading] = useState(true)

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
  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0]

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
        {!loading && (
          user ? (
            <Link
              href="/compte"
              className="flex flex-shrink-0 items-center gap-2.5 rounded-full border border-border bg-surface py-1.5 pl-1.5 pr-4 transition-all hover:shadow-md hover:border-accent/30"
            >
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt=""
                  width={28}
                  height={28}
                  className="rounded-full"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10">
                  <User className="h-3.5 w-3.5 text-accent" />
                </div>
              )}
              <span className="hidden text-[13px] font-medium text-text-primary md:block">
                {displayName}
              </span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="flex-shrink-0 rounded-full bg-primary px-5 py-2 text-[13px] font-semibold text-white hover:bg-primary-hover transition-all"
            >
              Se connecter
            </Link>
          )
        )}
      </div>
    </header>
  )
}
