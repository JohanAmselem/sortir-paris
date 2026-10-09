import { FilterBar } from '@/components/search/filter-bar'
import { LoadMore } from './load-more'
import { DataUnavailable, EmptyState, EventGrid, EventList } from './blocks'
import { EventCard } from './event-card'
import { bucketNow, safeQueryEvents } from '@/lib/events/query'
import { buildEventParams, eventsHref } from '@/lib/events/params'
import { formatFilmTimes, formatTime, parisParts } from '@/lib/paris-time'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { EventImage } from '@/components/ui/event-image'
import { filmCounts } from './event-card'
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
  /** Cinema séances out of the list, shown as a compact "Films" block instead. */
  filmsBlock?: { title: string }
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
  filmsBlock,
  children,
}: ListingProps) {
  const now = bucketNow()
  let merged: EventQuery = {
    ...query,
    ...Object.fromEntries(Object.entries(fixed).filter(([, v]) => v != null && !(Array.isArray(v) && v.length === 0))),
  }
  // Films apart unless the person filtered on a category (then cinema is either
  // asked for, or out anyway).
  const splitFilms = Boolean(filmsBlock) && !merged.categories?.length
  const filmsQuery: EventQuery = { ...merged, categories: ['cinema'], sort: 'relevance', limit: 10 }
  if (splitFilms) merged = { ...merged, excludeCategories: [...new Set([...(merged.excludeCategories ?? []), 'cinema'])] }
  const sort = merged.sort ?? (layout === 'slots' ? 'soon' : undefined)
  const [page, films] = await Promise.all([
    safeQueryEvents({ ...merged, sort, limit: PAGE }),
    splitFilms ? safeQueryEvents(filmsQuery) : Promise.resolve(null),
  ])
  const apiParams = buildEventParams({ ...merged, sort })
  const filmsSection =
    filmsBlock && films && films.events.length > 0 ? (
      <FilmsStrip title={filmsBlock.title} films={films.events} total={films.total} now={now} href={eventsHref({ ...filmsQuery, sort: undefined, limit: undefined }, '/evenements')} />
    ) : null

  return (
    <div>
      <FilterBar query={{ ...merged, excludeCategories: [] }} basePath={basePath} locked={locked} total={page.error ? undefined : page.total} />
      {children}
      {filmsSection}
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
              {/* Two big features on desktop only; on mobile everything is a compact row. */}
              <div className="hidden gap-4 md:grid md:grid-cols-2">
                {page.events.slice(0, 2).map((e, i) => (
                  <EventCard key={e.id} event={e} variant="feature" priority={i === 0} now={now} />
                ))}
              </div>
              <EventGrid events={page.events} now={now} dense className="md:mt-8" itemClassName={(i) => (i < 2 ? 'md:hidden' : undefined)} />
            </>
          ) : (
            <EventGrid events={page.events} now={now} dense />
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

/** Compact strip of films (one item per film, not per séance). */
function FilmsStrip({ title, films, total, now, href }: { title: string; films: CardEvent[]; total: number; now: Date; href: string }) {
  return (
    <section aria-labelledby="films-strip-title" className="mt-6 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="films-strip-title" className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">
          {title}
          <span className="ml-2 normal-case tracking-normal text-text-muted">{total.toLocaleString('fr-FR')} film{total > 1 ? 's' : ''}</span>
        </h2>
        <Link href={href} className="inline-flex h-10 shrink-0 items-center gap-1 text-[14px] font-semibold text-accent hover:text-accent-hover">
          Tous les films
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <ul className="rail scrollbar-hide -mx-4 mt-2 pb-1">
        {films.map((f) => (
          <li key={f.id} className="w-[132px]">
            <Link href={f.film ? `/films/${f.film.slug}` : `/evenements/${f.slug}`} className="group block">
              <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-paper-deep">
                <EventImage src={f.imageUrl} alt="" sizes="132px" categorySlug="cinema" />
              </div>
              <p className="mt-1.5 line-clamp-2 text-[14px] font-semibold leading-snug text-ink group-hover:underline">{f.title}</p>
              <p className="mt-0.5 line-clamp-1 text-[12px] text-text-secondary">
                {f.film ? formatFilmTimes(f.film.nextTimes, now) : formatTime(new Date(f.startDate))}
              </p>
              <p className="line-clamp-1 text-[12px] text-text-muted">{f.film ? filmCounts(f.film) : f.venue?.name}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
