import { EventRail, SectionHeader } from '@/components/events/blocks'
import { bucketNow } from '@/lib/events/query'
import { getPersonalPicks } from '@/lib/recommendations'

interface PourToiSectionProps {
  userId: string | null
  /** Ids already shown on the page. */
  excludeIds?: string[]
  /** Time window (default: next 7 days). */
  when?: string
  className?: string
}

/**
 * « Pour toi »: personal picks (quiz profile, preferences, saves, swipes) with
 * the reason of each pick. Server component; renders nothing when we know
 * nothing about the person or when there is nothing to show, so it can be
 * dropped anywhere (ideally inside <Suspense fallback={null}>).
 */
export async function PourToiSection({ userId, excludeIds, when = 'week', className }: PourToiSectionProps) {
  if (!userId) return null
  const picks = await getPersonalPicks({ userId, when, limit: 8, excludeIds }).catch((err) => {
    console.error('[pour-toi] failed', err)
    return null
  })
  if (!picks || !picks.plan.personalized || picks.events.length < 3) return null

  return (
    <section aria-labelledby="pour-toi-title" className={className}>
      <SectionHeader id="pour-toi-title" kicker="Choisi pour toi" title="Pour toi cette semaine" href="/drop" linkLabel="Ton drop" />
      <EventRail events={picks.events} now={bucketNow()} className="mt-5" />
    </section>
  )
}
