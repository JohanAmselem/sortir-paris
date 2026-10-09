'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** « Marquer comme vu »: one follow (id) or all of them. Refreshes the page. */
export function MarkSeenButton({ id, label = 'Marquer comme vu', className }: { id?: string; label?: string; className?: string }) {
  const router = useRouter()
  const [error, setError] = useState(false)
  const [isPending, startTransition] = useTransition()

  const onClick = () => {
    setError(false)
    startTransition(async () => {
      try {
        const res = await fetch('/api/follows', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(id ? { id, seen: true } : { seen: true }),
        })
        if (res.status === 401) {
          window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname)
          return
        }
        if (!res.ok) throw new Error(String(res.status))
        router.refresh()
      } catch {
        setError(true)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-ink transition-colors hover:border-ink',
        className
      )}
    >
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
      {error ? 'Échec, réessayer' : label}
    </button>
  )
}
