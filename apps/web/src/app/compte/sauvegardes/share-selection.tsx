'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'

/** Shares the upcoming saved events as a /partage link (max 20 ids). */
export function ShareSelection({ ids }: { ids: string[] }) {
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const url = `${window.location.origin}/partage?ids=${ids.join(',')}&title=${encodeURIComponent('Mes sorties à Paris')}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Mes sorties à Paris', url })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // cancelled
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex h-11 items-center gap-2 rounded-full border border-border-strong bg-surface px-4 text-[14px] font-semibold text-ink hover:border-ink"
    >
      <Share2 className="h-4 w-4" aria-hidden />
      <span aria-live="polite">{copied ? 'Lien copié' : 'Partager ma sélection'}</span>
    </button>
  )
}
