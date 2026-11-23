import Link from 'next/link'
import { cache } from 'react'
import { ChevronDown, MapPin, Mic2, X } from 'lucide-react'
import { AgendaFilters } from './agenda-filters'
import { HScroll } from './hscroll'
import { DayList } from '@/components/events/day-list'
import { EmptyState, EventList } from '@/components/events/blocks'
import { FollowButton } from '@/components/follow/follow-button'
import { SiteSearch } from '@/components/search/site-search'
import { getAgenda, agendaQuery } from '@/lib/agenda'
import { getDayCounts } from '@/lib/events/calendar'
import { bucketNow } from '@/lib/events/query'
import { resolveWindow } from '@/lib/paris-time'
import {
  agendaHref,
  agendaState,
  countLabel,
  dayLinks,
  isDayKey,
  monthLinks,
  monthOf,
  understoodChips,
  withParam,
} from '@/lib/agenda-view'
import type { AgendaResponse } from '@/lib/api-v2/contract'
import { cn } from '@/lib/utils'

export type SearchParams = Record<string, string | string[] | undefined>

/** Pagination et traces des anciennes pages : jamais repris. */
const IGNORED = new Set(['cursor', 'offset', 'limit', 'page'])

/** Paramètres de l'URL + ceux que la page impose (`/agenda/2027-03/concerts`, `/gratuit`…). */
export function mergeParams(sp: SearchParams, fixed: Record<string, string> = {}): URLSearchParams {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    const value = Array.isArray(v) ? v[0] : v
    if (value != null && value !== '' && !IGNORED.has(k)) p.set(k, value)
  }
  for (const [k, v] of Object.entries(fixed)) p.set(k, v)
  return p
}

/** Une seule lecture de l'Agenda par requête (métadonnées + page). */
export const loadAgenda = cache(async (qs: string): Promise<AgendaResponse> => getAgenda(new URLSearchParams(qs)))

/** Les compteurs par jour du mois regardé (aussi quand un jour est choisi). */
const loadDays = cache(async (qs: string, month: string) => {
  try {
    return await getDayCounts(agendaQuery(new URLSearchParams(qs)), month)
  } catch {
    return []
  }
})

interface AgendaViewProps {
  params: URLSearchParams
  title: string
  intro?: React.ReactNode
  /** Mois et jours : sur l'Agenda et les pages qui couvrent tout le futur. */
  showCalendar?: boolean
  showSearch?: boolean
  groupBy?: 'day' | 'slot'
  emptyActions?: Array<{ href: string; label: string }>
  children?: React.ReactNode
}

/**
 * L'Agenda : recherche, bande des mois et des jours, filtres, puces « On a
 * compris », artistes et lieux, expos à l'affiche, puis la liste groupée par jour.
 * Réutilisé par /ce-soir, /ce-week-end, /gratuit, /categories et /paris.
 */
export async function AgendaView({
  params,
  title,
  intro,
  showCalendar = true,
  showSearch = true,
  groupBy = 'day',
  emptyActions,
  children,
}: AgendaViewProps) {
  const now = bucketNow()
  const agenda = await loadAgenda(params.toString())
  const u = agenda.understood
  const state = agendaState(params, u)
  const month = monthOf(u.when)
  const dayCounts = month ? (agenda.days ?? (isDayKey(u.when) ? await loadDays(params.toString(), month) : [])) : []
  const window = resolveWindow(u.when, now)
  const rawQ = params.get('q')?.trim() ?? ''
  const chips = understoodChips(u, state, rawQ)
  const total = agenda.total ?? agenda.events.length
  const months = showCalendar ? monthLinks(agenda.months ?? [], state) : []
  const days = showCalendar && month ? dayLinks(month, dayCounts, state, now) : []

  return (
    <div className="px-4">
      <header className="pt-6 md:pt-10">
        <h1 className="t-display text-ink">{title}</h1>
        {intro && <div className="t-body mt-2 max-w-2xl text-text-secondary">{intro}</div>}
      </header>

      {showSearch && <SiteSearch initial={rawQ} size="lg" className="mt-5 max-w-2xl" id="recherche-agenda" />}

      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="t-small text-text-muted">{rawQ ? 'On a compris :' : 'Filtres :'}</span>
          {chips.map((c) => (
            <Link
              key={c.key}
              href={c.href}
              className="t-small inline-flex h-11 items-center gap-1.5 rounded-full bg-accent-soft pl-3.5 pr-3 font-semibold text-accent hover:bg-accent/25"
            >
              {c.label}
              <X className="h-4 w-4" aria-hidden />
              <span className="sr-only">(retirer)</span>
            </Link>
          ))}
        </div>
      )}

      {months.length > 0 && (
        <nav aria-label="Choisir un mois" className="mt-5">
          <HScroll label="Mois">
            {months.map((m) => (
              <li key={m.key} className="shrink-0">
                <Link
                  href={m.href}
                  aria-current={m.active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-14 min-w-[4.75rem] flex-col items-center justify-center rounded-xl border px-3 py-1.5 text-center transition-colors',
                    m.active ? 'border-ink bg-ink text-paper' : 'border-border-strong text-ink hover:border-ink'
                  )}
                >
                  <span className="t-small font-bold">{m.label}</span>
                  <span className={cn('t-small', m.active ? 'text-paper' : 'text-text-muted')}>{m.n.toLocaleString('fr-FR')}</span>
                </Link>
              </li>
            ))}
          </HScroll>
        </nav>
      )}

      {days.length > 0 && month && (
        <nav aria-label="Choisir un jour" className="mt-3">
          <HScroll label="Jours" className="gap-1">
            <li className="shrink-0">
              <Link
                href={agendaHref(withParam(state, 'when', month))}
                aria-current={u.when === month ? 'page' : undefined}
                className={cn(
                  't-small flex h-16 items-center rounded-xl px-3 font-semibold',
                  u.when === month ? 'bg-accent-soft text-accent' : 'text-text-secondary hover:bg-surface-hover'
                )}
              >
                Tout le mois
              </Link>
            </li>
            {days.map((d) => (
              <li key={d.key} className="shrink-0">
                <Link
                  href={d.href}
                  aria-current={d.active ? 'page' : undefined}
                  aria-label={`${d.weekday} ${d.day} : ${countLabel(d.n)}`}
                  className={cn(
                    'flex h-16 w-12 flex-col items-center justify-center rounded-xl transition-colors',
                    d.active ? 'bg-accent-soft text-accent' : d.n ? 'text-ink hover:bg-surface-hover' : 'text-text-faint hover:bg-surface-hover'
                  )}
                >
                  <span className={cn('t-micro', !d.active && 'text-text-muted')}>{d.weekday.replace('.', '')}</span>
                  <span className="t-title3">{d.day}</span>
                  <span className={cn('mt-0.5 h-1 w-1 rounded-full', d.n ? 'bg-accent' : 'bg-transparent')} aria-hidden />
                </Link>
              </li>
            ))}
          </HScroll>
        </nav>
      )}

      <div className="mt-4">
        <AgendaFilters state={state} />
      </div>

      {children}

      {(agenda.artists?.length || agenda.venues?.length) ? (
        <section aria-label="Artistes et lieux" className="mt-6 grid gap-3 md:grid-cols-2">
          {agenda.artists?.map((a) => (
            <div key={a.key} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Mic2 className="h-5 w-5" aria-hidden />
              </span>
              <Link href={`/agenda?q=${encodeURIComponent(a.name)}`} className="min-w-0 flex-1">
                <span className="t-body block truncate font-bold text-ink">{a.name}</span>
                <span className="t-small block text-text-muted">
                  {a.dates} date{a.dates > 1 ? 's' : ''} à Paris
                </span>
              </Link>
              <FollowButton compact target={{ kind: 'artist', term: a.key, label: a.name }} label={`Suivre ${a.name}`} />
            </div>
          ))}
          {agenda.venues?.map((v) => (
            <Link key={v.slug} href={`/lieux/${v.slug}`} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 hover:border-border-strong">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-hover text-text-secondary">
                <MapPin className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-body block truncate font-bold text-ink">{v.name}</span>
                <span className="t-small block text-text-muted">{v.area ? `Lieu · ${v.area}` : 'Lieu'} · tout le programme</span>
              </span>
            </Link>
          ))}
        </section>
      ) : null}

      <p className="t-small mt-6 text-text-secondary">
        <strong className="font-bold text-ink">{countLabel(total, u.categories)}</strong>
        {u.whenLabel ? ` · ${u.whenLabel.charAt(0).toLowerCase()}${u.whenLabel.slice(1)}` : ' à venir'}
        {groupBy === 'day' && total > 1 ? ', du plus proche au plus lointain' : ''}
      </p>

      {agenda.ongoing && agenda.ongoing.length > 0 && (
        <details className="group mt-4 rounded-2xl border border-border bg-surface">
          <summary className="t-body flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <span>
              À l’affiche pendant cette période <span className="font-normal text-text-muted">· expos et saisons</span>
            </span>
            <ChevronDown className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <EventList events={agenda.ongoing} now={now} className="border-t border-border px-4" />
        </details>
      )}

      {agenda.events.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="Rien pour ces critères"
          actions={
            emptyActions ?? [
              ...(chips.length ? [{ href: '/agenda', label: 'Tout l’agenda' }] : []),
              { href: '/ce-week-end', label: 'Ce week-end' },
            ]
          }
        >
          {rawQ ? 'Essaie un mot plus simple, un autre mois, ou retire un filtre.' : 'Essaie un autre mois ou retire un filtre.'}
        </EmptyState>
      ) : (
        <DayList
          key={state.toString()}
          className="mt-2"
          initial={agenda.events}
          nextCursor={agenda.nextCursor}
          nextOffset={agenda.nextOffset}
          params={params.toString()}
          nowIso={now.toISOString()}
          fromIso={window && window.start > now ? window.start.toISOString() : null}
          groupBy={groupBy}
          dayCounts={Object.fromEntries(dayCounts.map((d) => [d.key, d.n]))}
          categories={u.categories}
        />
      )}
    </div>
  )
}
