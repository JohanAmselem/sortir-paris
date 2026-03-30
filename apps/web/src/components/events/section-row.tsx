import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
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
    <section className="py-6">
      {/* Header */}
      <div className="flex items-center justify-between px-4 lg:px-0">
        <h2 className="text-xl font-bold text-text-primary">
          {icon && <span className="mr-2">{icon}</span>}
          {title}
        </h2>
        {href && (
          <Link
            href={href}
            className="flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-hover"
          >
            Voir tout
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      {/* Horizontal scroll */}
      <div className="scrollbar-hide mt-3 flex gap-4 overflow-x-auto px-4 lg:px-0">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            className="w-[280px] flex-shrink-0 lg:w-[300px]"
          />
        ))}
      </div>
    </section>
  )
}
