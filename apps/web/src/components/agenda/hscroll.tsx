'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Bande qui défile à l'horizontale (mois, jours) et montre l'élément actif au
 * chargement, sans faire bouger la page.
 */
export function HScroll({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  const ref = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const el = ref.current
    const active = el?.querySelector<HTMLElement>('[aria-current="page"], [aria-current="true"]')
    if (el && active) el.scrollLeft = Math.max(0, active.offsetLeft - 48)
  }, [])
  return (
    <ul ref={ref} aria-label={label} className={cn('scrollbar-hide relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1', className)}>
      {children}
    </ul>
  )
}
