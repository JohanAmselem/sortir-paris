'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, Loader2, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function callbackUrl(next: string) {
  const url = new URL('/api/auth/callback', window.location.origin)
  if (next && next !== '/') url.searchParams.set('next', next)
  return url.toString()
}

export function LoginForm({ next, authError }: { next: string; authError: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState<'google' | 'email' | null>(null)
  const [error, setError] = useState(authError ? 'La connexion n’a pas abouti. Réessaie.' : '')

  const google = async () => {
    setLoading('google')
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl(next) } })
    if (error) {
      setError('Connexion Google indisponible pour l’instant. Essaie par email.')
      setLoading(null)
    }
  }

  const magicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError('Cette adresse email ne semble pas valide.')
      return
    }
    setLoading('email')
    setError('')
    const { error } = await supabase.auth.signInWithOtp({ email: value, options: { emailRedirectTo: callbackUrl(next) } })
    if (error) setError('Le lien n’a pas pu être envoyé. Réessaie dans un instant.')
    else setSent(true)
    setLoading(null)
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-accent bg-accent-soft p-6 text-center" role="status">
        <Mail className="mx-auto h-8 w-8 text-accent" aria-hidden />
        <p className="font-display mt-3 text-[1.8rem] text-ink">Regarde tes mails</p>
        <p className="mt-1 text-[15px] text-text-secondary">
          On a envoyé un lien de connexion à <strong className="font-semibold text-ink">{email.trim()}</strong>. Pense à vérifier les
          indésirables.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-4 inline-flex h-11 items-center px-3 text-[14px] font-semibold text-accent underline underline-offset-2"
        >
          Utiliser une autre adresse
        </button>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={google}
        disabled={loading !== null}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-border-strong bg-surface text-[15px] font-semibold text-ink transition-colors hover:border-ink disabled:opacity-60"
      >
        {loading === 'google' ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
        )}
        Continuer avec Google
      </button>

      <div className="my-6 flex items-center gap-3 text-[13px] text-text-muted" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        ou par email
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={magicLink} noValidate>
        <label htmlFor="login-email" className="block text-[14px] font-semibold text-ink">
          Ton adresse email
        </label>
        <input
          id="login-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="toi@exemple.fr"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? 'login-error' : undefined}
          className="mt-1.5 h-12 w-full rounded-xl border border-border-strong bg-surface px-4 text-[16px] text-ink placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        {error && (
          <p id="login-error" className="mt-2 text-[14px] font-medium text-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading !== null}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-semibold text-paper transition-colors hover:bg-ink-soft disabled:opacity-60"
        >
          {loading === 'email' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Recevoir un lien de connexion
          {loading !== 'email' && <ArrowRight className="h-4 w-4" aria-hidden />}
        </button>
        <p className="mt-2 text-[13px] text-text-muted">Pas de mot de passe : un lien suffit.</p>
      </form>
    </div>
  )
}
