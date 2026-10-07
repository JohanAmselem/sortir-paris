'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { User } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

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

  // Reserve the space to avoid layout shift while the session loads.
  if (!ready) return <div className="hidden h-9 w-24 md:block" aria-hidden />

  if (!user) {
    return (
      <Link
        href="/login"
        className="hidden h-9 items-center rounded-full bg-ink px-4 text-[13px] font-semibold text-paper transition-colors hover:bg-ink-soft md:flex"
      >
        Se connecter
      </Link>
    )
  }

  const avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture
  return (
    <Link
      href="/compte"
      aria-label="Mon compte"
      className="hidden h-9 items-center gap-2 rounded-full border border-border bg-surface pl-1 pr-3 text-[13px] font-medium text-ink transition-colors hover:border-border-strong md:flex"
    >
      {avatar ? (
        <Image src={avatar} alt="" width={28} height={28} className="rounded-full" unoptimized />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft">
          <User className="h-4 w-4 text-accent" aria-hidden />
        </span>
      )}
      Mon compte
    </Link>
  )
}
