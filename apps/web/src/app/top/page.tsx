import { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { Star, Trophy, Medal, Award, ArrowRight, MessageSquare, TrendingUp } from 'lucide-react'
import { db, events, venues, categories, eventReviews } from '@sortir/db'
import { eq, gte, desc, sql, and, count, avg } from 'drizzle-orm'
import { StarRating } from '@/components/events/star-rating'
import { formatPriceRange, formatEventDate } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Top événements — Les mieux notés par les membres',
  description: 'Découvrez les événements les mieux notés par la communauté Paname Club. Concerts, expos, spectacles — le classement des sorties préférées à Paris.',
}

export const revalidate = 300 // 5 minutes

// Rank medal component
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
        <Trophy className="h-5 w-5 text-amber-500" />
      </div>
    )
  if (rank === 2)
    return (
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-300/15">
        <Medal className="h-5 w-5 text-gray-400" />
      </div>
    )
  if (rank === 3)
    return (
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-700/15">
        <Award className="h-5 w-5 text-amber-700" />
      </div>
    )
  return (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-surface-hover">
      <span className="text-[15px] font-bold text-text-muted">#{rank}</span>
    </div>
  )
}

export default async function TopPage() {
  const now = new Date()

  // Get top-rated events with at least 1 review
  const topEvents = await db
    .select({
      event: events,
      venue: venues,
      category: categories,
      avgRating: avg(eventReviews.rating).as('avg_rating'),
      reviewCount: count(eventReviews.id).as('review_count'),
    })
    .from(eventReviews)
    .innerJoin(events, eq(eventReviews.eventId, events.id))
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(and(eq(events.status, 'active'), gte(events.startDate, now)))
    .groupBy(events.id, venues.id, categories.id)
    .orderBy(
      desc(sql`avg(${eventReviews.rating})`),
      desc(sql`count(${eventReviews.id})`),
      desc(events.qualityScore)
    )
    .limit(50)

  // Also get trending events (most reviewed recently)
  const trendingEvents = await db
    .select({
      event: events,
      venue: venues,
      category: categories,
      avgRating: avg(eventReviews.rating).as('avg_rating'),
      reviewCount: count(eventReviews.id).as('review_count'),
    })
    .from(eventReviews)
    .innerJoin(events, eq(eventReviews.eventId, events.id))
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(and(eq(events.status, 'active'), gte(events.startDate, now)))
    .groupBy(events.id, venues.id, categories.id)
    .orderBy(desc(sql`count(${eventReviews.id})`), desc(sql`avg(${eventReviews.rating})`))
    .limit(10)

  // Global stats
  const [globalStats] = await db
    .select({
      totalReviews: count(eventReviews.id),
    })
    .from(eventReviews)

  const hasRatings = topEvents.length > 0

  return (
    <div className="pb-24">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-bg to-accent/5 px-4 py-10 md:py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(234,179,8,0.08),transparent_60%)]" />
        <div className="relative mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wider text-amber-600">
            <Trophy className="h-3.5 w-3.5" />
            Classement
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-text-primary md:text-4xl">
            Top des événements
          </h1>
          <p className="mt-2 text-[15px] text-text-secondary">
            Les sorties préférées de la communauté Paname Club
          </p>
          {Number(globalStats.totalReviews) > 0 && (
            <p className="mt-1 text-[13px] text-text-muted">
              Basé sur {globalStats.totalReviews} avis de membres
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4">
        {hasRatings ? (
          <>
            {/* Podium — Top 3 */}
            {topEvents.length >= 3 && (
              <div className="mt-8 grid grid-cols-3 gap-2 md:gap-3">
                {[topEvents[1], topEvents[0], topEvents[2]].map((item, idx) => {
                  const rank = idx === 0 ? 2 : idx === 1 ? 1 : 3
                  const avgR = parseFloat(String(item.avgRating ?? 0))
                  return (
                    <Link
                      key={item.event.id}
                      href={`/evenements/${item.event.slug}`}
                      className={`group relative flex flex-col items-center rounded-2xl border border-border/60 bg-surface p-3 transition-all hover:border-amber-500/30 hover:shadow-lg ${
                        rank === 1 ? 'md:-mt-4 ring-2 ring-amber-500/20' : ''
                      }`}
                    >
                      {/* Image */}
                      <div className={`relative w-full overflow-hidden rounded-xl bg-surface-hover ${
                        rank === 1 ? 'aspect-[3/4]' : 'aspect-square'
                      }`}>
                        {item.event.imageUrl ? (
                          <Image
                            src={item.event.imageUrl}
                            alt={item.event.title}
                            fill
                            className="object-cover transition-transform duration-300 group-hover:scale-105"
                            sizes="(max-width: 768px) 33vw, 250px"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <span className="text-3xl opacity-30">{item.category?.icon ?? '🎭'}</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                        {/* Medal */}
                        <div className="absolute top-2 left-2">
                          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-black ${
                            rank === 1
                              ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
                              : rank === 2
                                ? 'bg-gray-300 text-gray-700'
                                : 'bg-amber-800 text-amber-100'
                          }`}>
                            {rank}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 w-full text-center">
                        <p className="line-clamp-2 text-[12px] font-semibold leading-tight text-text-primary md:text-[13px]">
                          {item.event.title}
                        </p>
                        <div className="mt-1 flex items-center justify-center gap-1">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          <span className="text-[12px] font-bold text-amber-600">{avgR.toFixed(1)}</span>
                          <span className="text-[10px] text-text-muted">({String(item.reviewCount)})</span>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}

            {/* Full ranking list */}
            <div className="mt-8">
              <h2 className="flex items-center gap-2 text-[15px] font-bold text-text-primary">
                <Star className="h-4 w-4 text-amber-500" />
                Classement complet
              </h2>

              <div className="mt-4 space-y-2">
                {topEvents.map((item, idx) => {
                  const rank = idx + 1
                  const avgR = parseFloat(String(item.avgRating ?? 0))
                  const startDate = item.event.startDate ? new Date(item.event.startDate) : null
                  return (
                    <Link
                      key={item.event.id}
                      href={`/evenements/${item.event.slug}`}
                      className="group flex items-center gap-3 rounded-xl border border-border/40 bg-surface/50 p-3 transition-all hover:border-accent/30 hover:bg-surface hover:shadow-sm"
                    >
                      <RankBadge rank={rank} />

                      {/* Thumbnail */}
                      <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-surface-hover">
                        {item.event.imageUrl ? (
                          <Image
                            src={item.event.imageUrl}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="56px"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <span className="text-lg opacity-30">{item.category?.icon ?? '🎭'}</span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-text-primary leading-tight line-clamp-1 group-hover:text-accent transition-colors">
                          {item.event.title}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2">
                          {item.category && (
                            <span className="text-[11px] text-text-muted">
                              {item.category.icon} {item.category.name}
                            </span>
                          )}
                          {item.venue && (
                            <span className="text-[11px] text-text-muted truncate">
                              {item.venue.name}
                            </span>
                          )}
                        </div>
                        {startDate && (
                          <p className="mt-0.5 text-[11px] text-text-muted">
                            {formatEventDate(startDate)}
                          </p>
                        )}
                      </div>

                      {/* Rating */}
                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        <div className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          <span className="text-[14px] font-bold text-text-primary">{avgR.toFixed(1)}</span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <MessageSquare className="h-2.5 w-2.5 text-text-muted" />
                          <span className="text-[10px] text-text-muted">{String(item.reviewCount)} avis</span>
                        </div>
                      </div>

                      <ArrowRight className="h-4 w-4 text-text-muted/50 group-hover:text-accent transition-colors flex-shrink-0" />
                    </Link>
                  )
                })}
              </div>
            </div>

            {/* Trending section */}
            {trendingEvents.length > 0 && (
              <div className="mt-12">
                <h2 className="flex items-center gap-2 text-[15px] font-bold text-text-primary">
                  <TrendingUp className="h-4 w-4 text-accent" />
                  Les plus commentés
                </h2>
                <div className="scrollbar-hide mt-4 flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
                  {trendingEvents.map((item) => {
                    const avgR = parseFloat(String(item.avgRating ?? 0))
                    return (
                      <Link
                        key={item.event.id}
                        href={`/evenements/${item.event.slug}`}
                        className="group w-[200px] flex-shrink-0 snap-start rounded-xl border border-border/40 bg-surface/50 overflow-hidden transition-all hover:border-accent/30 hover:shadow-sm"
                      >
                        <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-hover">
                          {item.event.imageUrl ? (
                            <Image
                              src={item.event.imageUrl}
                              alt=""
                              fill
                              className="object-cover transition-transform duration-300 group-hover:scale-105"
                              sizes="200px"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <span className="text-3xl opacity-30">{item.category?.icon ?? '🎭'}</span>
                            </div>
                          )}
                        </div>
                        <div className="p-2.5">
                          <p className="line-clamp-2 text-[12px] font-semibold leading-tight text-text-primary">
                            {item.event.title}
                          </p>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            <span className="text-[12px] font-bold">{avgR.toFixed(1)}</span>
                            <span className="text-[10px] text-text-muted">· {String(item.reviewCount)} avis</span>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                  <div className="w-1 flex-shrink-0" />
                </div>
              </div>
            )}
          </>
        ) : (
          /* Empty state */
          <div className="mt-12 text-center py-16">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/10">
              <Trophy className="h-10 w-10 text-amber-500/50" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-text-primary">Pas encore de classement</h2>
            <p className="mt-2 text-[14px] text-text-secondary max-w-md mx-auto">
              Les membres n&apos;ont pas encore noté d&apos;événements. Sois le premier à donner ton avis sur un événement !
            </p>
            <Link
              href="/evenements"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-[14px] font-semibold text-white transition-all hover:bg-accent-hover"
            >
              Explorer les événements
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
