import type { Metadata } from 'next'
import Link from 'next/link'
import { Bookmark, Star, Users } from 'lucide-react'
import { EventCard } from '@/components/events/event-card'
import { DataUnavailable, EmptyState, EventRail, SectionHeader } from '@/components/events/blocks'
import { bucketNow, safeQueryEvents } from '@/lib/events/query'
import { getMembersLovedPast, getMembersTopThisWeek, MIN_REVIEWS_FOR_TOP, type LovedEvent, type RankedEvent } from '@/app/club/_lib/member'

export const revalidate = 600

export const metadata: Metadata = {
  title: 'Top des membres : les sorties que le club garde cette semaine',
  description:
    'Les sorties à Paris les plus gardées par les membres de Paname Club cette semaine, et celles qu’ils ont le mieux notées.',
  alternates: { canonical: '/top' },
}

export default async function TopPage() {
  const now = bucketNow()
  const [top, loved, popular] = await Promise.all([
    getMembersTopThisWeek().catch((err): RankedEvent[] | null => {
      console.error('[top] week failed', err)
      return null
    }),
    getMembersLovedPast().catch((err): LovedEvent[] | null => {
      console.error('[top] loved failed', err)
      return null
    }),
    safeQueryEvents({ when: 'week', withImage: true, sort: 'popular', limit: 8 }),
  ])

  return (
    <div className="px-4 pb-16 pt-8 sm:pt-12">
      <header className="max-w-2xl">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">Le Club · Top des membres</p>
        <h1 className="font-display mt-2 text-[3.2rem] text-ink sm:text-[4.4rem]">Ce que le club garde</h1>
        <p className="mt-3 text-[16px] text-text-secondary">
          Les sorties des 7 prochains jours que les membres ont gardées ou où ils vont, et celles qu’ils ont adorées.
        </p>
      </header>

      <section aria-labelledby="week-title" className="pt-10">
        <SectionHeader id="week-title" kicker="Cette semaine" title="Les plus gardées" />
        {top === null ? (
          <DataUnavailable className="mt-5" />
        ) : top.length === 0 ? (
          <EmptyState
            className="mt-5"
            title="Le classement se remplit"
            actions={[
              { href: '/match', label: 'Swiper des sorties' },
              { href: '/evenements?when=week', label: 'Toute la semaine' },
            ]}
          >
            Aucun membre n’a encore gardé de sortie pour les 7 prochains jours. Garde les tiennes, elles apparaîtront ici.
          </EmptyState>
        ) : (
          <ol className="mt-5 divide-y divide-border">
            {top.map((t, i) => (
              <li key={t.event.id} className="flex items-start gap-3">
                <span className="font-display w-10 shrink-0 pt-3 text-[2.4rem] text-accent tabular-nums" aria-label={`Numéro ${i + 1}`}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <EventCard event={t.event} variant="row" now={now} />
                  <p className="-mt-1 flex flex-wrap gap-x-4 gap-y-1 pb-3 text-[13px] text-text-secondary">
                    <span className="inline-flex items-center gap-1">
                      <Bookmark className="h-3.5 w-3.5" aria-hidden />
                      {t.saves} {t.saves > 1 ? 'membres l’ont gardée' : 'membre l’a gardée'}
                    </span>
                    {t.attendances > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" aria-hidden />
                        {t.attendances} y {t.attendances > 1 ? 'vont' : 'va'}
                      </span>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="loved-title" className="pt-14">
        <SectionHeader id="loved-title" kicker="Notées par les membres" title="Ils ont adoré" />
        {loved === null ? (
          <DataUnavailable className="mt-5" />
        ) : loved.length === 0 ? (
          <p className="mt-4 max-w-xl text-[15px] text-text-secondary">
            Pas encore assez d’avis : une sortie apparaît ici quand au moins {MIN_REVIEWS_FOR_TOP} membres l’ont notée. Tu es
            allé voir quelque chose ? Note-le depuis sa fiche.
          </p>
        ) : (
          <ul className="mt-5 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {loved.map((l) => (
              <li key={l.event.id}>
                <EventCard event={l.event} now={now} showSave={false} />
                <p className="mt-2 inline-flex items-center gap-1 text-[14px] font-semibold text-ink">
                  <Star className="h-4 w-4 fill-warning text-warning" aria-hidden />
                  {l.avgRating.toLocaleString('fr-FR')} / 5
                  <span className="font-normal text-text-secondary">· {l.reviews} avis</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!popular.error && popular.events.length > 0 && (
        <section aria-labelledby="popular-title" className="pt-14">
          <SectionHeader id="popular-title" kicker="Sur tout le site" title="Les plus consultées" href="/evenements?when=week&sort=popular" />
          <EventRail events={popular.events} now={now} className="mt-5" />
        </section>
      )}

      <p className="mt-12 text-[15px] text-text-secondary">
        Le top est calculé à partir des sorties gardées, des « j’y vais » et des avis des membres.{' '}
        <Link href="/club" className="font-semibold text-accent underline underline-offset-2">
          Rejoins le Club
        </Link>{' '}
        pour peser dans le classement.
      </p>
    </div>
  )
}
