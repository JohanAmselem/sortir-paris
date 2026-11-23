'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { SiteSearch } from '@/components/search/site-search'

/**
 * Recherche de l'en-tête : un champ sur grand écran ; sur téléphone, une loupe
 * qui ouvre le champ sous l'en-tête. Cachée sur l'accueil et l'Agenda, qui ont
 * déjà la leur en haut de page.
 */
export function HeaderSearch() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [pathname])
  const hasOwn = pathname === '/' || pathname === '/agenda' || pathname.startsWith('/agenda/')

  return (
    <>
      <div className="flex-1" />
      {!hasOwn && <SiteSearch className="hidden w-full max-w-sm lg:block" id="recherche-entete" />}
      {!hasOwn && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="recherche-mobile"
          aria-label={open ? 'Fermer la recherche' : 'Rechercher'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover hover:text-ink lg:hidden"
        >
          {open ? <X className="h-5 w-5" aria-hidden /> : <Search className="h-5 w-5" aria-hidden />}
        </button>
      )}
      {open && (
        <div id="recherche-mobile" className="absolute inset-x-0 top-full border-b border-border bg-paper px-4 py-3 lg:hidden">
          <SiteSearch autoFocus id="recherche-mobile-champ" />
        </div>
      )}
    </>
  )
}
