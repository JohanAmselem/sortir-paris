'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/** Suppression définitive, en deux temps : case à cocher, puis bouton. */
export function DeleteAccountForm({ email }: { email: string | null }) {
  const [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = async () => {
    if (!confirmed || pending) return
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'SUPPRIMER' }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error || 'La suppression a échoué, réessaie dans un instant.')
      }
      await createClient().auth.signOut().catch(() => {})
      window.location.href = '/suppression-compte?fait=1'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La suppression a échoué, réessaie dans un instant.')
      setPending(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <p className="t-body text-text-secondary">
        Compte connecté : <strong className="font-semibold text-ink">{email ?? 'ton compte'}</strong>
      </p>
      <label className="t-body mt-4 flex items-start gap-3 text-ink">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        <span>J’ai compris : mon compte et toutes mes données seront supprimés définitivement, sans retour possible.</span>
      </label>
      <button
        type="button"
        onClick={remove}
        disabled={!confirmed || pending}
        className="t-small mt-5 inline-flex h-11 items-center gap-2 rounded-full border border-error bg-surface px-4 font-semibold text-error transition-colors hover:bg-error hover:text-white disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        {pending ? 'Suppression…' : 'Supprimer mon compte'}
      </button>
      {error && (
        <p role="alert" className="t-small mt-3 text-error">
          {error}
        </p>
      )}
    </div>
  )
}
