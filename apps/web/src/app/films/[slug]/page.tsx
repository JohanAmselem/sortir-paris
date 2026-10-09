import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin } from 'lucide-react'
import { EmptyState } from '@/components/events/blocks'
import { EventImage } from '@/components/ui/event-image'
import { getFilmSeances } from '@/lib/events/films'
import { bucketNow } from '@/lib/events/query'
import { formatLongDay, formatTime, parisNightDay } from '@/lib/paris-time'
import { formatPrice } from '@/lib/format'
import type { CardEvent } from '@/lib/events/types'

export const revalidate = 600

interface Props {
  params: Promise<{ slug: string }>
}

/** Rendered on first visit, then cached (ISR). */
export function generateStaticParams() {
  return []
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  if (!SLUG_RE.test(slug) || slug.length > 160) return { title: 'Film introuvable', robots: { index: false } }
  const seances = await getFilmSeances(slug)
  if (!seances.length) return { title: 'Aucune séance à venir', robots: { index: false, follow: true } }
  const title = seances[0].title
  const salles = new Set(seances.map((s) => s.venue?.slug)).size
  return {
    title: `${title} : séances à Paris`,
    description: `Toutes les séances de ${title} à Paris : ${seances.length} séance${seances.length > 1 ? 's' : ''} dans ${salles} salle${salles > 1 ? 's' : ''}, jour par jour.`,
    alternates: { canonical: `/films/${slug}` },
  }
}

interface Day {
  key: string
  date: Date
  cinemas: Array<{ venue: NonNullable<CardEvent['venue']> | null; seances: CardEvent[] }>
}

/** Séances by Paris day, then by cinema (cinemas with the earliest séance first). */
function groupByDay(seances: CardEvent[]): Day[] {
  const days = new Map<string, Day>()
  for (const s of seances) {
    const start = new Date(s.startDate)
    const d = parisNightDay(start)
    const key = `${d.year}-${d.month}-${d.day}`
    let day = days.get(key)
    if (!day) {
      day = { key, date: start, cinemas: [] }
      days.set(key, day)
    }
    const vKey = s.venue?.slug ?? s.id
    let cinema = day.cinemas.find((c) => (c.venue?.slug ?? c.seances[0].id) === vKey)
    if (!cinema) {
      cinema = { venue: s.venue, seances: [] }
      day.cinemas.push(cinema)
    }
    cinema.seances.push(s)
  }
  return [...days.values()]
}

export default async function FilmPage({ params }: Props) {
  const { slug } = await params
  if (!SLUG_RE.test(slug) || slug.length > 160) notFound()
  const now = bucketNow()
  const seances = await getFilmSeances(slug)
  const first = seances[0]
  const image = seances.find((s) => s.imageUrl)?.imageUrl ?? null
  const days = groupByDay(seances)
  const salles = new Set(seances.map((s) => s.venue?.slug)).size

  if (!first) {
    return (
      <div className="px-4 pt-8">
        <EmptyState
          title="Plus de séance à venir"
          actions={[
            { href: '/evenements?cat=cinema&when=tonight', label: 'Les films ce soir' },
            { href: '/categories/cinema', label: 'Tout le cinéma' },
          ]}
        >
          Ce film n’a plus de séance repérée à Paris pour le moment.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="px-4 pb-16">
      <nav aria-label="Fil d’Ariane" className="py-3 text-[13px] text-text-secondary">
        <Link href="/categories/cinema" className="hover:text-ink hover:underline">
          Cinéma
        </Link>
      </nav>
      <div className="grid gap-6 md:grid-cols-[240px_1fr] md:gap-10">
        <div className="relative mx-auto aspect-[2/3] w-[180px] overflow-hidden rounded-xl bg-paper-deep md:w-full">
          <EventImage src={image} alt={`Affiche de ${first.title}`} sizes="240px" priority categorySlug="cinema" />
        </div>
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">Au cinéma</p>
          <h1 className="font-display mt-1 text-[2.6rem] text-ink sm:text-[3.4rem]">{first.title}</h1>
          <p className="mt-2 text-[16px] text-text-secondary">
            {seances.length >= 300 ? 'Plus de 300' : seances.length} séance{seances.length > 1 ? 's' : ''} à venir dans {salles} salle{salles > 1 ? 's' : ''} à Paris et autour.
          </p>
          {first.shortDesc && <p className="mt-4 max-w-[68ch] text-[16px] leading-relaxed text-ink-soft">{first.shortDesc}</p>}

          <div className="mt-8 space-y-8">
            {days.map((day) => {
              const label = formatLongDay(day.date, now)
              return (
                <section key={day.key} aria-label={label}>
                  <h2 className="sticky top-14 z-10 -mx-4 bg-paper/95 px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">
                    {label}
                  </h2>
                  <ul className="divide-y divide-border">
                    {day.cinemas.map((c) => (
                      <li key={c.venue?.slug ?? c.seances[0].id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          {c.venue ? (
                            <Link href={`/lieux/${c.venue.slug}`} className="text-[16px] font-semibold text-ink hover:underline">
                              {c.venue.name}
                            </Link>
                          ) : (
                            <span className="text-[16px] font-semibold text-ink">Salle non précisée</span>
                          )}
                          {c.venue && (c.venue.arrondissement || c.venue.city) && (
                            <p className="flex items-center gap-1 text-[13px] text-text-secondary">
                              <MapPin className="h-3.5 w-3.5" aria-hidden />
                              {c.venue.arrondissement ?? c.venue.city}
                            </p>
                          )}
                        </div>
                        <ul className="flex flex-wrap gap-2" aria-label="Horaires">
                          {c.seances.map((s) => {
                            const price = formatPrice(s)
                            return (
                              <li key={s.id}>
                                <Link
                                  href={`/evenements/${s.slug}`}
                                  className="inline-flex h-10 min-w-[3.5rem] items-center justify-center rounded-full border border-border-strong bg-surface px-3 text-[14px] font-semibold text-ink transition-colors hover:border-ink"
                                  title={price.tone === 'paid' ? price.label : undefined}
                                >
                                  {s.timeKnown ? formatTime(new Date(s.startDate)) : 'Horaire ?'}
                                </Link>
                              </li>
                            )
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
