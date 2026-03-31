import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { EventCard } from './event-card'
import type { EventWithRelations } from '@sortir/shared'

interface SectionRowProps {
  title: string
  icon?: string
  href?: string
  events: EventWithRelations[]
}

export function SectionRow({ title, icon, href, events }: SectionRowProps) {
  if (events.length === 0) return null

  return (
    <section className="py-8">
      {/* Header */}
      <div className="flex items-center justify-between px-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
          {icon && <span>{icon}</span>}
          {title}
        </h2>
        {href && (
          <Link
            href={href}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[13px] font-medium text-accent hover:bg-accent/5 transition-colors"
          >
            Tout voir
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {/* Horizontal scroll */}
      <div className="scrollbar-hide mt-4 flex gap-3 overflow-x-auto px-4 snap-x snap-mandatory">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            className="w-[260px] flex-shrink-0 snap-start sm:w-[280px]"
          />
        ))}
        {/* Scroll padding */}
        <div className="w-1 flex-shrink-0" />
      </div>
    </section>
  )
}
