'use client'

import { useState, useEffect } from 'react'
import { ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={cn(
        'fixed bottom-20 right-4 z-30 flex h-10 w-10 items-center justify-center',
        'rounded-full bg-primary/80 text-white shadow-lg backdrop-blur-sm',
        'transition-all duration-300 hover:bg-primary',
        'md:bottom-8',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
      )}
      aria-label="Retour en haut"
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  )
}
