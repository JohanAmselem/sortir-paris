import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { EventCard } from '@/components/events/event-card'
import { DataUnavailable, EmptyState, EventGrid } from '@/components/events/blocks'
import { bucketNow } from '@/lib/events/query'
import { formatShortDay, parisDate } from '@/lib/paris-time'
import { ARCHETYPES } from '@/lib/taste-quiz-data'
import { getSessionUser } from '@/app/club/_lib/api'
import { getAnonymousDrop, getMemberDrop, type WeeklyDrop } from '@/app/club/_lib/drop'
import { LocalSync } from '@/app/club/_components/local-sync'
import { LocalDrop } from './local-drop'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Le Drop du lundi : 5 sorties à Paris pour ta semaine',
  description:
    'Chaque lundi, 5 idées de sortie à Paris pour les 7 prochains jours, choisies selon tes goûts, avec la raison de chaque choix.',
  alternates: { canonical: '/drop' },
}

/** The drop is weekly (Monday → Sunday): "5 oct.", the Monday it was made. */
function weekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number)
  return formatShortDay(parisDate(y, m, d, 12))
}

export default async function DropPage() {
  const now = bucketNow()
  const user = await getSessionUser()
  let drop: WeeklyDrop | null = null
  try {
    drop = user ? await getMemberDrop(user.id) : await getAnonymousDrop()
  } catch (err) {
    console.error('[drop] failed', err)
  }
  const archetype = drop?.archetype ? ARCHETYPES[drop.archetype] : null
  const [first, ...rest] = drop?.events ?? []

  return (
    <div className="px-4 pb-16 pt-8 sm:pt-12">
      <LocalSync />
      <header className="max-w-2xl">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">Le Club · Drop du lundi</p>
        <h1 className="font-display mt-2 text-[3.2rem] text-ink sm:text-[4.4rem]">
          {user && drop?.personalized ? 'Tes 5 sorties de la semaine' : '5 sorties pour ta semaine'}
        </h1>
        <p className="mt-3 text-[16px] text-text-secondary">
          {drop ? `Drop de la semaine du ${weekLabel(drop.weekStart)}. ` : ''}
          {user
            ? archetype
              ? `Choisies pour ton profil ${archetype.name}, tes swipes et tes sorties gardées. Elles ne bougent pas de la semaine.`
              : 'Choisies selon tes swipes et tes sorties gardées. Elles ne bougent pas de la semaine.'
            : 'Les valeurs sûres des 7 prochains jours. Joue au Club pour recevoir les tiennes.'}
        </p>
      </header>

      {!drop || (drop.error && drop.events.length === 0) ? (
        <DataUnavailable className="mt-8" />
      ) : drop.events.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="Rien à te proposer pour l’instant"
          actions={[
            { href: '/ce-week-end', label: 'Ce week-end' },
            { href: '/evenements', label: 'Tout l’agenda' },
          ]}
        >
          {drop.ended > 0
            ? 'Les sorties de ton drop sont passées. Le prochain arrive lundi.'
            : 'Le programme de la semaine se remplit encore. Reviens un peu plus tard.'}
        </EmptyState>
      ) : user ? (
        <section aria-label="Ta sélection" className="mt-8">
          <EventCard event={first} variant="feature" rank={1} priority now={now} />
          {rest.length > 0 && <EventGrid events={rest} now={now} className="mt-8" />}
          {drop.ended > 0 && (
            <p className="mt-6 text-[14px] text-text-muted">
              {drop.ended} sortie{drop.ended > 1 ? 's' : ''} de ton drop {drop.ended > 1 ? 'sont passées' : 'est passée'}. Le prochain
              drop arrive lundi.
            </p>
          )}
        </section>
      ) : (
        <LocalDrop initial={drop.events} nowIso={now.toISOString()} />
      )}

      {/* Make it personal */}
      {(!user || !drop?.personalized) && (
        <section className="mt-12 grid gap-3 sm:grid-cols-2" aria-label="Personnaliser ton drop">
          <Link href="/quiz" className="group rounded-2xl bg-night p-5 text-paper transition-colors hover:bg-night-soft">
            <p className="font-display text-[1.8rem]">Fais le quiz, 2 minutes</p>
            <p className="mt-1 text-[14px] text-paper/80">Ton profil culturel oriente directement ton drop.</p>
            <span className="mt-3 inline-flex h-11 items-center gap-1.5 text-[14px] font-semibold text-accent-glow">
              Tu préfères…
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </Link>
          <Link href="/match" className="group rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-ink">
            <p className="font-display text-[1.8rem] text-ink">Swipe quelques sorties</p>
            <p className="mt-1 text-[14px] text-text-secondary">Chaque « ça me tente » compte pour le prochain drop.</p>
            <span className="mt-3 inline-flex h-11 items-center gap-1.5 text-[14px] font-semibold text-accent">
              Lancer Match
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </Link>
        </section>
      )}
      {!user && (
        <p className="mt-6 text-[15px] text-text-secondary">
          <Link href="/login?next=/drop" className="font-semibold text-accent underline underline-offset-2">
            Crée ton compte
          </Link>{' '}
          pour que ton drop soit prêt chaque lundi et le retrouver sur tous tes appareils.
        </p>
      )}
    </div>
  )
}
