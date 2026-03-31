'use client'

import { Share2, Check, Copy } from 'lucide-react'
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
      onClick={handleShare}
      className={cn(
        'flex items-center justify-center rounded-xl border border-border bg-surface transition-all',
        'hover:border-accent/30 hover:shadow-sm active:scale-95',
        className
      )}
      aria-label="Partager"
    >
      {copied ? (
        <Check className="h-4 w-4 text-success" />
      ) : (
        <Share2 className="h-4 w-4 text-text-secondary" />
      )}
    </button>
  )
}
