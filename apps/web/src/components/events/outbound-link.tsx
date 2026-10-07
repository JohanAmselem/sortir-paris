'use client'

import { track } from '@/lib/analytics'

/** External link to tickets / organiser, tracked as the funnel's conversion. */
export function OutboundLink({
  href,
  eventId,
  source,
  kind,
  className,
  children,
}: {
  href: string
  eventId: string
  source: string
  kind: 'booking' | 'source' | 'venue'
  className?: string
  children: React.ReactNode
}) {
  let domain = ''
  try {
    domain = new URL(href).hostname.replace(/^www\./, '')
  } catch {}
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={className}
      onClick={() => track('outbound_click', { kind, domain, source, event: eventId })}
    >
      {children}
    </a>
  )
}
