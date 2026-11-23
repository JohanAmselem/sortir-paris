'use client'

import { ArrowRight } from 'lucide-react'
import { SaveButton } from './save-button'
import { OutboundLink } from './outbound-link'
import { cn } from '@/lib/utils'

interface BookingProps {
  href: string
  label: string
  /** « dès 38,50 € », « gratuit » */
  detail: string | null
  eventId: string
  source: string
  className?: string
}

/** LE bouton principal de la fiche : « Réserver · dès 38,50 € ». */
export function BookingButton({ href, label, detail, eventId, source, className }: BookingProps) {
  return (
    <OutboundLink
      href={href}
      eventId={eventId}
      source={source}
      kind="booking"
      className={cn(
        't-body inline-flex h-13 items-center justify-center gap-2 rounded-2xl bg-accent-strong px-6 font-bold text-white transition-colors hover:bg-accent-strong-hover',
        className
      )}
    >
      {label}
      {detail && <span className="font-medium">· {detail}</span>}
      <ArrowRight className="h-5 w-5" aria-hidden />
    </OutboundLink>
  )
}

/** Sur téléphone : Garder + Réserver, collés en bas de l'écran (la barre d'onglets s'efface). */
export function BookingBar({ href, label, detail, eventId, source }: Omit<BookingProps, 'href' | 'className'> & { href: string | null }) {
  return (
    <div className="glass fixed inset-x-0 bottom-0 z-40 border-t border-border px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:hidden">
      <div className="flex items-center gap-2.5">
        <SaveButton eventId={eventId} appearance="square" />
        {href ? (
          <BookingButton href={href} label={label} detail={detail} eventId={eventId} source={source} className="min-w-0 flex-1 px-4" />
        ) : (
          <span className="t-small flex h-13 flex-1 items-center justify-center rounded-2xl bg-surface text-text-secondary">Pas de lien de réservation</span>
        )}
      </div>
    </div>
  )
}
