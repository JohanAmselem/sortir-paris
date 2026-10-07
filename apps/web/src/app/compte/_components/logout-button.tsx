'use client'

import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function LogoutButton() {
  const [pending, setPending] = useState(false)
  const logout = async () => {
    setPending(true)
    try {
      await createClient().auth.signOut()
    } finally {
      window.location.href = '/'
    }
  }
  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className="inline-flex h-11 items-center gap-2 rounded-full border border-border-strong bg-surface px-4 text-[14px] font-semibold text-ink transition-colors hover:border-error hover:text-error disabled:opacity-60"
    >
      <LogOut className="h-4 w-4" aria-hidden />
      Se déconnecter
    </button>
  )
}
