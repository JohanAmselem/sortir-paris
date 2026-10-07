import { FilterBar } from '@/components/search/filter-bar'
import { LoadMore } from './load-more'
import { DataUnavailable, EmptyState, EventGrid, EventList } from './blocks'
import { EventCard } from './event-card'
import { bucketNow, safeQueryEvents } from '@/lib/events/query'
import { buildEventParams } from '@/lib/events/params'
import { formatTime, parisParts } from '@/lib/paris-time'
import type { CardEvent, EventQuery } from '@/lib/events/types'

type Lockable = 'when' | 'categories' | 'arrondissements' | 'free'

interface ListingProps {
  /** Filters coming from the URL. */
  query: EventQuery
  /** Filters fixed by the page (merged over the URL ones). */
  fixed?: EventQuery
  locked?: Lockable[]
  basePath: string
  /** 'slots' groups tonight's events by time of evening. */
  layout?: 'grid' | 'slots' | 'list'
  emptyTitle?: string
  emptyText?: string
  emptyActions?: Array<{ href: string; label: string }>
  children?: React.ReactNode
}

const PAGE = 24

function slotOf(e: CardEvent, now: Date): string {
  const start = new Date(e.startDate)
  if (start <= now) return 'En ce moment'
  if (!e.timeKnown) return 'Horaire à confirmer'
  const h = parisParts(start).hour
  if (h < 17 && h >= 4) return 'Avant 17h'
  if (h < 20) return '17h – 20h'
  if (h < 22) return '20h – 22h'
  return 'Tard dans la nuit'
}

const SLOT_ORDER = ['En ce moment', 'Avant 17h', '17h – 20h', '20h – 22h', 'Tard dans la nuit', 'Horaire à confirmer']

/** Shared listing template: filter bar, results, empty / error states, load more. */
export async function Listing({
  query,
  fixed = {},
  locked = [],
  basePath,
  layout = 'grid',
  emptyTitle = 'Rien pour ces critères',
  emptyText = 'Essaie d’enlever un filtre ou d’élargir la période.',
  emptyActions,
  children,
}: ListingProps) {
  const now = bucketNow()
  const merged: EventQuery = {
    ...query,
    ...Object.fromEntries(Object.entries(fixed).filter(([, v]) => v != null && !(Array.isArray(v) && v.length === 0))),
  }
  const sort = merged.sort ?? (layout === 'slots' ? 'soon' : undefined)
  const page = await safeQueryEvents({ ...merged, sort, limit: PAGE })
  const apiParams = buildEventParams({ ...merged, sort })

  return (
    <div>
      <FilterBar query={merged} basePath={basePath} locked={locked} total={page.error ? undefined : page.total} />
      {children}
      {page.error ? (
        <DataUnavailable className="mt-6" />
      ) : page.events.length === 0 ? (
        <EmptyState className="mt-6" title={emptyTitle} actions={emptyActions}>
          {emptyText}
        </EmptyState>
      ) : layout === 'slots' ? (
        <div className="mt-6 space-y-8">
          {SLOT_ORDER.map((slot) => {
            const items = page.events.filter((e) => slotOf(e, now) === slot)
            if (!items.length) return null
            return (
              <section key={slot} aria-label={slot}>
                <h2 className="sticky top-14 z-10 -mx-4 bg-paper/95 px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">
                  {slot}
                  {slot === 'En ce moment' && <span className="ml-2 normal-case tracking-normal text-text-muted">à {formatTime(now)}</span>}
                </h2>
                <EventList events={items} now={now} />
              </section>
            )
          })}
          <LoadMore params={apiParams.toString()} initialCount={page.events.length} total={page.total} nowIso={now.toISOString()} layout="list" seenIds={page.events.map((e) => e.id)} />
        </div>
      ) : layout === 'list' ? (
        <div className="mt-6">
          <EventList events={page.events} now={now} />
          <LoadMore params={apiParams.toString()} initialCount={page.events.length} total={page.total} nowIso={now.toISOString()} layout="list" seenIds={page.events.map((e) => e.id)} />
        </div>
      ) : (
        <div className="mt-6">
          {page.events.length >= 7 && !merged.q ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {page.events.slice(0, 2).map((e, i) => (
                  <EventCard key={e.id} event={e} variant="feature" priority={i === 0} now={now} />
                ))}
              </div>
              <EventGrid events={page.events.slice(2)} now={now} className="mt-8" />
            </>
          ) : (
            <EventGrid events={page.events} now={now} />
          )}
          <LoadMore params={apiParams.toString()} initialCount={page.events.length} total={page.total} nowIso={now.toISOString()} seenIds={page.events.map((e) => e.id)} />
        </div>
      )}
    </div>
  )
}

export function PageIntro({ kicker, title, children }: { kicker?: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="pb-5 pt-6">
      {kicker && <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">{kicker}</p>}
      <h1 className="font-display mt-1 text-[2.8rem] text-ink sm:text-[3.6rem]">{title}</h1>
      {children && <div className="mt-2 max-w-2xl text-[16px] leading-relaxed text-text-secondary">{children}</div>}
    </header>
  )
}
