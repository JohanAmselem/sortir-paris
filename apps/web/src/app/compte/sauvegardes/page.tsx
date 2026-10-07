import type { Metadata } from 'next'
import { DataUnavailable, EmptyState, EventGrid, EventList } from '@/components/events/blocks'
import type { CardEvent } from '@/lib/events/types'
import { requireUser } from '@/app/club/_lib/api'
import { getSavedEvents } from '@/app/club/_lib/member'
import { BackLink } from '../_components/back-link'
import { ShareSelection } from './share-selection'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mes sorties',
  robots: { index: false, follow: false },
}

export default async function SauvegardesPage() {
  const user = await requireUser('/compte/sauvegardes')
  let saved: { upcoming: CardEvent[]; past: CardEvent[] } | null = null
  try {
    saved = await getSavedEvents(user.id)
  } catch (err) {
    console.error('[compte/sauvegardes] failed', err)
  }
  const now = new Date()

  return (
    <div className="px-4 pb-16 pt-6">
      <BackLink />
      <header className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[3rem] text-ink sm:text-[3.6rem]">Mes sorties</h1>
          {saved && (
            <p className="mt-1 text-[15px] text-text-secondary">
              {saved.upcoming.length} à venir · {saved.past.length} passée{saved.past.length > 1 ? 's' : ''}
            </p>
          )}
        </div>
        {saved && saved.upcoming.length > 0 && <ShareSelection ids={saved.upcoming.slice(0, 20).map((e) => e.id)} />}
      </header>

      {!saved ? (
        <DataUnavailable className="mt-8" />
      ) : saved.upcoming.length === 0 && saved.past.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="Rien de gardé pour l’instant"
          actions={[
            { href: '/ce-soir', label: 'Ce soir' },
            { href: '/ce-week-end', label: 'Ce week-end' },
            { href: '/match', label: 'Swiper des sorties' },
          ]}
        >
          Touche le marque-page d’une sortie pour la retrouver ici.
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="upcoming-title" className="mt-8">
            <h2 id="upcoming-title" className="font-display text-[2rem] text-ink">
              À venir
            </h2>
            {saved.upcoming.length ? (
              <EventGrid events={saved.upcoming} now={now} className="mt-5" />
            ) : (
              <p className="mt-3 text-[15px] text-text-secondary">Aucune sortie à venir. Le Drop du lundi a peut-être une idée.</p>
            )}
          </section>
          {saved.past.length > 0 && (
            <section aria-labelledby="past-title" className="mt-14">
              <h2 id="past-title" className="font-display text-[2rem] text-ink">
                Déjà passées
              </h2>
              <p className="mt-1 text-[14px] text-text-secondary">Tu y es allé ? Note-les depuis leur fiche.</p>
              <EventList events={saved.past.slice(0, 30)} now={now} className="mt-3" />
            </section>
          )}
        </>
      )}
    </div>
  )
}
