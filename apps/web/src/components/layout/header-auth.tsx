'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { User } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

/** Le compte, derrière l'avatar (ou « Se connecter » sur grand écran). */
export function HeaderAuth() {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null))
    return () => data.subscription.unsubscribe()
  }, [supabase])

  // Place réservée pendant le chargement de la session : pas de saut de mise en page.
  if (!ready) return <div className="h-11 w-11 shrink-0 md:w-28" aria-hidden />

  if (!user) {
    return (
      <>
        <Link
          href="/login"
          aria-label="Se connecter"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover hover:text-ink md:hidden"
        >
          <User className="h-5 w-5" aria-hidden />
        </Link>
        <Link
          href="/login"
          className="t-small hidden h-11 shrink-0 items-center rounded-full bg-ink px-4 font-semibold text-paper transition-colors hover:bg-ink-soft md:flex"
        >
          Se connecter
        </Link>
      </>
    )
  }

  const avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture
  return (
    <Link href="/compte" aria-label="Mon compte" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-surface-hover">
      {avatar ? (
        <Image src={avatar} alt="" width={32} height={32} className="rounded-full" unoptimized />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-hover text-text-secondary">
          <User className="h-4 w-4" aria-hidden />
        </span>
      )}
    </Link>
  )
}
