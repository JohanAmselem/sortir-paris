'use client'

import { Share2, Check } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ShareButtonProps {
  title: string
  text?: string
  url?: string
  className?: string
}

export function ShareButton({ title, text, url, className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const shareUrl = url || window.location.href

    // Try native share first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({ title, text: text || title, url: shareUrl })
        return
      } catch {
        // User cancelled or not supported
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback fallback
      const input = document.createElement('input')
      input.value = shareUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-full border border-border-strong bg-surface transition-colors hover:border-ink active:scale-95',
        className
      )}
      aria-label={copied ? 'Lien copié' : 'Partager'}
    >
      {copied ? <Check className="h-[18px] w-[18px] text-success" aria-hidden /> : <Share2 className="h-[18px] w-[18px] text-ink" aria-hidden />}
      <span className="sr-only" aria-live="polite">{copied ? 'Lien copié' : ''}</span>
    </button>
  )
}
