'use client'

import { useState } from 'react'
import { Send, Check, Loader2 } from 'lucide-react'

export function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setStatus('loading')
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })

      if (res.ok) {
        setStatus('success')
      } else {
        const data = await res.json()
        setErrorMsg(data.error ?? 'Une erreur est survenue')
        setStatus('error')
      }
    } catch {
      setErrorMsg('Erreur de connexion')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-free/10 px-6 py-4 text-[14px] font-medium text-free">
        <Check className="h-5 w-5" />
        Inscrit ! À très vite dans ta boîte mail.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6">
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setStatus('idle') }}
          placeholder="ton@email.com"
          required
          className="flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-[14px] text-text-primary placeholder:text-text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-[14px] font-bold text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent-hover active:scale-[0.98] disabled:opacity-60"
        >
          {status === 'loading' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          S&apos;inscrire
        </button>
      </div>
      {status === 'error' && (
        <p className="mt-2 text-[12px] text-red-400">{errorMsg}</p>
      )}
    </form>
  )
}
