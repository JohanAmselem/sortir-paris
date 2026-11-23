import type { Metadata } from 'next'
import Link from 'next/link'
import { BellRing, ChevronRight, Mic2, Plus, Settings } from 'lucide-react'
import { DataUnavailable, EmptyState } from '@/components/events/blocks'
import { OutingTicket } from '@/components/events/ticket'
import { EventImage } from '@/components/ui/event-image'
import { getSessionUser } from '@/lib/member/api'
import { getAttendingEvents, getSavedEvents } from '@/lib/member/member'
import { getFollowFeed, type FollowFeed } from '@/lib/member/follows'
import { mergeOutings, outingGroups, pastGroups, type OutingGroup } from '@/lib/outings'
import { premier } from '@/lib/agenda-view'
import { bucketNow } from '@/lib/events/query'
import { formatLongDay } from '@/lib/paris-time'
import { cn } from '@/lib/utils'
import type { CardEvent } from '@/lib/events/types'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mes sorties',
  robots: { index: false, follow: false },
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

type Lists = { upcoming: CardEvent[]; past: CardEvent[] }

async function safe<T>(p: Promise<T>, label: string): Promise<T | null> {
  try {
    return await p
  } catch (err) {
    console.error(`[mes-sorties] ${label}`, err)
    return null
  }
}

export default async function MesSortiesPage({ searchParams }: Props) {
  const user = await getSessionUser()
  const sp = await searchParams
  const showPast = sp.vue === 'passees'
  const now = bucketNow()

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-10 pt-6 md:pt-10">
        <h1 className="t-display text-ink">Mes sorties</h1>
        <p className="t-body mt-2 text-text-secondary">Les sorties que tu gardes et celles où tu vas, rangées par date, avec les nouvelles dates de tes artistes.</p>
        <LoginLine className="mt-6" />
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link href="/agenda" className="t-body flex min-h-14 items-center justify-between rounded-2xl border border-border bg-surface px-4 font-semibold text-ink hover:border-border-strong">
            Parcourir l’agenda
            <ChevronRight className="h-4 w-4 text-text-muted" aria-hidden />
          </Link>
          <Link href="/alertes-concerts" className="t-body flex min-h-14 items-center justify-between rounded-2xl border border-border bg-surface px-4 font-semibold text-ink hover:border-border-strong">
            Alertes concerts
            <ChevronRight className="h-4 w-4 text-text-muted" aria-hidden />
          </Link>
        </div>
      </div>
    )
  }

  const [saved, going, feed] = await Promise.all([
    safe<Lists>(getSavedEvents(user.id), 'saves'),
    safe<Lists>(getAttendingEvents(user.id), 'attendances'),
    safe<FollowFeed>(getFollowFeed(user.id), 'feed'),
  ])
  const failed = !saved && !going
  const upcoming = mergeOutings(saved?.upcoming ?? [], going?.upcoming ?? [])
  const past = mergeOutings(saved?.past ?? [], going?.past ?? [])
  const groups: OutingGroup[] = showPast ? pastGroups(past, now) : outingGroups(upcoming, now)

  const artistFollows = (feed?.follows ?? []).filter((f) => f.kind === 'artist')
  const newByFollow = new Map((feed?.groups ?? []).map((g) => [g.follow.id, g.matches]))
  const latest = (feed?.groups ?? [])
    .flatMap((g) => g.matches.map((m) => ({ follow: g.follow, match: m })))
    .sort((a, b) => b.match.addedAt.localeCompare(a.match.addedAt))[0]

  const tab = (on: boolean) =>
    cn('t-small flex min-h-11 items-center justify-center rounded-xl font-semibold transition-colors', on ? 'bg-surface text-ink shadow-sm' : 'text-text-muted hover:text-ink')

  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-6 md:pt-10">
      <header className="flex items-center justify-between gap-4">
        <h1 className="t-display text-ink">Mes sorties</h1>
        <Link
          href="/compte"
          aria-label="Mon compte et mes réglages"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-secondary hover:border-ink hover:text-ink"
        >
          <Settings className="h-5 w-5" aria-hidden />
        </Link>
      </header>

      <nav aria-label="À venir ou passées" className="mt-5 grid grid-cols-2 gap-1 rounded-2xl bg-surface-hover p-1">
        <Link href="/mes-sorties" aria-current={!showPast ? 'page' : undefined} className={tab(!showPast)}>
          À venir · {upcoming.length}
        </Link>
        <Link href="/mes-sorties?vue=passees" aria-current={showPast ? 'page' : undefined} className={tab(showPast)}>
          Passées · {past.length}
        </Link>
      </nav>

      {failed ? (
        <DataUnavailable className="mt-6" />
      ) : groups.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={showPast ? 'Rien de passé pour l’instant' : 'Rien de prévu pour l’instant'}
          actions={[
            { href: '/ce-soir', label: 'Ce soir' },
            { href: '/agenda', label: 'L’agenda' },
          ]}
        >
          Touche « Garder » ou « J’y vais » sur une sortie : elle arrive ici, rangée par date.
        </EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-labelledby={`g-${g.key}`} className="mt-6">
            <h2 id={`g-${g.key}`} className="t-micro text-text-muted">
              {g.label}
            </h2>
            <ul className="mt-2 space-y-2.5">
              {g.items.map((o) => (
                <li key={o.event.id}>
                  <OutingTicket outing={o} now={now} past={showPast} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <section aria-labelledby="artistes-titre" className="mt-12">
        <div className="flex items-end justify-between gap-4">
          <h2 id="artistes-titre" className="t-title2 text-ink">
            Mes artistes
          </h2>
          <Link href="/compte/artistes" className="t-small inline-flex min-h-11 items-center font-semibold text-accent hover:text-accent-hover">
            Gérer
          </Link>
        </div>
        <ul className="scrollbar-hide -mx-4 mt-3 flex gap-4 overflow-x-auto px-4 pb-1">
          {artistFollows.slice(0, 20).map((f) => {
            const fresh = newByFollow.get(f.id) ?? []
            const image = fresh.find((m) => m.event.imageUrl)?.event.imageUrl ?? null
            return (
              <li key={f.id} className="w-[76px] shrink-0 text-center">
                <Link href={`/agenda?q=${encodeURIComponent(f.label)}`} className="group block">
                  <span className="relative mx-auto block h-[72px] w-[72px]">
                    <span className="absolute inset-0 overflow-hidden rounded-full bg-surface-hover">
                      {image ? (
                        <EventImage src={image} alt="" sizes="72px" fallback="sm" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-text-muted">
                          <Mic2 className="h-6 w-6" aria-hidden />
                        </span>
                      )}
                    </span>
                    {fresh.length > 0 && (
                      <span className="t-micro absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-paper bg-neon px-1 tracking-normal text-paper">
                        {fresh.length}
                        <span className="sr-only"> nouvelle{fresh.length > 1 ? 's' : ''} date{fresh.length > 1 ? 's' : ''}</span>
                      </span>
                    )}
                  </span>
                  <span className="t-small mt-1.5 line-clamp-2 block font-semibold leading-tight text-ink group-hover:underline">{f.label}</span>
                </Link>
              </li>
            )
          })}
          <li className="w-[76px] shrink-0 text-center">
            <Link href="/compte/artistes" className="group block">
              <span className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-dashed border-border-strong text-text-muted group-hover:border-ink group-hover:text-ink">
                <Plus className="h-6 w-6" aria-hidden />
              </span>
              <span className="t-small mt-1.5 block font-semibold text-text-secondary">Ajouter</span>
            </Link>
          </li>
        </ul>
        {latest && (
          <Link
            href={`/evenements/${latest.match.event.slug}`}
            className="t-small mt-4 grid grid-cols-[22px_1fr] gap-2.5 rounded-2xl bg-accent-soft p-3.5 text-ink hover:bg-accent/20"
          >
            <BellRing className="mt-0.5 h-5 w-5 text-accent" aria-hidden />
            <span>
              <strong className="font-bold">{latest.follow.label}</strong> a une nouvelle date : {premier(formatLongDay(new Date(latest.match.event.startDate), now))}
              {latest.match.event.venue ? ` à ${latest.match.event.venue.name}` : ''}.
            </span>
          </Link>
        )}
        {artistFollows.length === 0 && (
          <p className="t-small mt-3 text-text-secondary">
            Suis tes artistes : une alerte dès qu’ils annoncent une date à Paris.{' '}
            <Link href="/alertes-concerts" className="font-semibold text-accent underline underline-offset-2">
              Alertes concerts
            </Link>
          </p>
        )}
      </section>

      <nav aria-label="Compte" className="mt-10 grid gap-2 sm:grid-cols-2">
        <Link href="/compte/parametres" className="t-body flex min-h-14 items-center justify-between rounded-2xl border border-border bg-surface px-4 font-semibold text-ink hover:border-border-strong">
          Réglages
          <ChevronRight className="h-4 w-4 text-text-muted" aria-hidden />
        </Link>
        <Link href="/compte/artistes#alertes" className="t-body flex min-h-14 items-center justify-between rounded-2xl border border-border bg-surface px-4 font-semibold text-ink hover:border-border-strong">
          Mes alertes et rappels
          <ChevronRight className="h-4 w-4 text-text-muted" aria-hidden />
        </Link>
      </nav>
    </div>
  )
}

function LoginLine({ className }: { className?: string }) {
  return (
    <div className={cn('grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-border px-4 py-3.5', className)}>
      <p className="t-small text-text-secondary">
        <span className="t-body block font-bold text-ink">Garde tout sur ton compte</span>
        Tes sorties sur le site et sur ton téléphone.
      </p>
      <Link href="/login?next=%2Fmes-sorties" className="t-small inline-flex h-11 items-center rounded-full bg-ink px-4 font-bold text-paper hover:bg-ink-soft">
        Se connecter
      </Link>
    </div>
  )
}
