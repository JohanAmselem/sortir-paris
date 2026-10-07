'use client'

import { ExternalLink } from 'lucide-react'
import { SaveButton } from './save-button'
import { ShareButton } from '@/components/ui/share-button'
import { OutboundLink } from './outbound-link'

interface EventActionBarProps {
  eventId: string
  title: string
  href: string | null
  label: string
  source: string
}

/** Mobile action bar for the event page. Replaces the bottom navigation there. */
export function EventActionBar({ eventId, title, href, label, source }: EventActionBarProps) {
  return (
    <div className="glass fixed inset-x-0 bottom-0 z-40 border-t border-border px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:hidden">
      <div className="flex items-center gap-2">
        <SaveButton eventId={eventId} className="h-12 w-12 border border-border-strong bg-surface shadow-none" />
        <ShareButton title={title} className="h-12 w-12 rounded-full" />
        {href ? (
          <OutboundLink
            href={href}
            eventId={eventId}
            source={source}
            kind="booking"
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-paper"
          >
            {label}
            <ExternalLink className="h-4 w-4" aria-hidden />
          </OutboundLink>
        ) : (
          <span className="flex h-12 flex-1 items-center justify-center rounded-full bg-paper-deep text-[14px] text-text-secondary">
            Pas de lien de réservation
          </span>
        )}
      </div>
    </div>
  )
}
