'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

type Status = 'idle' | 'loading' | 'success' | 'error'

export function NewsletterForm({ source = 'newsletter-page', className }: { source?: string; className?: string }) {
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('') // honeypot
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setStatus('error')
      setMessage('Cette adresse email ne semble pas valide.')
      return
    }
    setStatus('loading')
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, website, source }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; confirmBy?: 'email' | 'later' }
      if (!res.ok) {
        setStatus('error')
        setMessage(data.error ?? 'L’inscription n’a pas abouti. Réessaie dans un instant.')
        return
      }
      track('newsletter_signup', { source })
      setStatus('success')
      setMessage(
        data.confirmBy === 'email'
          ? 'Presque fini : clique sur le lien qu’on vient de t’envoyer pour confirmer.'
          : 'Merci, on t’écrit très vite.'
      )
    } catch {
      setStatus('error')
      setMessage('Connexion perdue. Réessaie dans un instant.')
    }
  }

  if (status === 'success') {
    return (
      <p className={cn('flex items-center justify-center gap-2 rounded-xl bg-accent-soft p-4 text-[15px] font-semibold text-accent', className)} role="status">
        <Check className="h-5 w-5 shrink-0" aria-hidden />
        {message}
      </p>
    )
  }

  return (
    <form onSubmit={submit} noValidate className={className}>
      <label htmlFor="newsletter-email" className="sr-only">
        Ton adresse email
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="newsletter-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="toi@exemple.fr"
          aria-invalid={status === 'error' || undefined}
          aria-describedby={status === 'error' ? 'newsletter-error' : undefined}
          className="h-12 min-w-0 flex-1 rounded-full border border-border-strong bg-surface px-5 text-[16px] text-ink placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[15px] font-semibold text-paper transition-colors hover:bg-ink-soft disabled:opacity-60"
        >
          {status === 'loading' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Je m’inscris
        </button>
      </div>
      {/* Honeypot: invisible to humans and assistive tech. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="newsletter-website">Site web</label>
        <input id="newsletter-website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {status === 'error' && (
        <p id="newsletter-error" className="mt-2 text-[14px] font-medium text-error" role="alert">
          {message}
        </p>
      )}
    </form>
  )
}
