import { DataUnavailable } from '@/components/events/blocks'
import { LastDates, NewForYou } from '@/components/follow/follow-feed'
import { FollowsList } from '@/components/follow/follows-list'
import { MarkSeenButton } from '@/components/follow/mark-seen-button'
import type { FollowFeed } from '@/app/club/_lib/follows'

/** /compte: « Nouveautés pour toi », « Dernières dates » and the follows list. */
export function FollowsSection({ feed, now }: { feed: FollowFeed; now: Date }) {
  if (feed.error) {
    return (
      <section aria-labelledby="nouveautes-title" id="nouveautes" className="mt-10 scroll-mt-20">
        <h2 id="nouveautes-title" className="font-display text-[2rem] text-ink">
          Nouveautés pour toi
        </h2>
        <DataUnavailable className="mt-4" />
      </section>
    )
  }

  return (
    <>
      <section aria-labelledby="nouveautes-title" id="nouveautes" className="mt-10 scroll-mt-20">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="nouveautes-title" className="font-display text-[2rem] text-ink">
            Nouveautés pour toi
          </h2>
          {feed.groups.length > 1 && <MarkSeenButton label="Tout marquer comme vu" />}
        </div>
        <div className="mt-4">
          {feed.follows.length === 0 ? (
            <p className="text-[15px] text-text-secondary">
              Suis un lieu ou un artiste depuis sa page (bouton « Suivre ») : chaque nouvelle date ajoutée apparaîtra ici.
            </p>
          ) : (
            <NewForYou groups={feed.groups} now={now} />
          )}
        </div>
      </section>

      {feed.lastDates.length > 0 && (
        <section aria-labelledby="dernieres-dates-title" className="mt-10">
          <h2 id="dernieres-dates-title" className="font-display text-[2rem] text-ink">
            Dernières dates
          </h2>
          <p className="mt-1 text-[14px] text-text-secondary">Ce que tu suis, dans les 7 prochains jours.</p>
          <div className="mt-4">
            <LastDates items={feed.lastDates} now={now} />
          </div>
        </section>
      )}

      {feed.follows.length > 0 && (
        <section aria-labelledby="suivis-title" className="mt-10">
          <h2 id="suivis-title" className="font-display text-[2rem] text-ink">
            Ce que tu suis
          </h2>
          <div className="mt-4">
            <FollowsList initial={feed.follows} />
          </div>
        </section>
      )}
    </>
  )
}
