'use client'

import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'

interface StickyBookingCTAProps {
  href: string
  label: string
  targetId: string
}

export function StickyBookingCTA({ href, label, targetId }: StickyBookingCTAProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const target = document.getElementById(targetId)
    if (!target) return

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0 }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [targetId])

  if (!visible) return null

  return (
    <div className="fixed bottom-[4.5rem] left-0 right-0 z-40 border-t border-border/60 bg-bg/80 px-4 py-3 backdrop-blur-lg md:hidden animate-slide-up">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-[14px] font-bold text-white shadow-lg shadow-accent/20 transition-all active:scale-[0.98]"
      >
        <ExternalLink className="h-4 w-4" />
        {label}
      </a>
    </div>
  )
}
