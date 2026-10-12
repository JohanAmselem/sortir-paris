'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BellRing, X } from 'lucide-react'
import { track } from '@/lib/analytics'
import {
  ACTIVATED_COOKIE,
  ACTIVATED_PARAM,
  PENDING_FOLLOW_COOKIE,
  parseActivated,
  readCookie,
  withoutActivatedParam,
  type ActivatedResult,
} from '@/lib/pending-follow'

const clearCookie = (name: string) => {
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`
}

/**
 * « Alerte activée pour X »: shown once after a visitor logged in from a
 * « Créer mon alerte » / « Suivre » button. The follow itself is created by
 * the auth callback; if its cookie is still there (other login path), the
 * page asks POST /api/follows/pending to do it.
 */
export function AlertActivatedBanner() {
  const pathname = usePathname()
  const [result, setResult] = useState<ActivatedResult | null>(null)

  useEffect(() => {
    const cookies = document.cookie
    const fromCookie = parseActivated(readCookie(cookies, ACTIVATED_COOKIE))
    const url = new URL(window.location.href)
    const flagged = url.searchParams.get(ACTIVATED_PARAM) === '1'
    if (flagged) window.history.replaceState(window.history.state, '', withoutActivatedParam(url.pathname + url.search + url.hash))

    const show = (r: ActivatedResult) => {
      setResult(r)
      if (r.ok) track('alerts_follow_activated', { path: url.pathname })
    }
    if (fromCookie) {
      clearCookie(ACTIVATED_COOKIE)
      show(fromCookie)
      return
    }
    if (!flagged || !readCookie(cookies, PENDING_FOLLOW_COOKIE)) return
    const ctrl = new AbortController()
    fetch('/api/follows/pending', { method: 'POST', signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { result?: unknown } | null) => {
        const r = d?.result ? parseActivated(encodeURIComponent(JSON.stringify(d.result))) : null
        if (r) show(r)
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [pathname])

  useEffect(() => {
    if (!result) return
    const t = setTimeout(() => setResult(null), 15_000)
    return () => clearTimeout(t)
  }, [result])

  if (!result) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6">
      <div
        role="status"
        className={
          'pointer-events-auto flex w-full max-w-md animate-slide-up items-start gap-3 rounded-2xl border p-4 shadow-lg ' +
          (result.ok ? 'border-accent bg-surface' : 'border-neon/40 bg-neon-soft')
        }
      >
        <BellRing className={'mt-0.5 h-5 w-5 shrink-0 ' + (result.ok ? 'text-accent' : 'text-neon')} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink">
            {result.ok ? `Alerte activée pour ${result.label}` : `Alerte non créée pour ${result.label}`}
          </p>
          <p className="mt-0.5 text-[14px] text-text-secondary">
            {result.ok ? 'On te prévient dès qu’une nouvelle date est annoncée à Paris. ' : `${result.error} `}
            <Link href="/compte/artistes" className="font-semibold text-accent underline underline-offset-2" onClick={() => setResult(null)}>
              Gérer mes alertes
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setResult(null)}
          className="-m-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden />
          <span className="sr-only">Fermer</span>
        </button>
      </div>
    </div>
  )
}
