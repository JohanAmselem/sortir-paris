import Link from 'next/link'
import { ArrowRight, Dices, MapPinned } from 'lucide-react'
import { Discover } from '@/components/home/discover'
import { PourToiClient } from '@/components/home/pour-toi-client'
import { WeekendProgram, type ProgramDay } from '@/components/home/weekend-program'
import { EventCard } from '@/components/events/event-card'
import { DataUnavailable, EventList, EventRail, SectionHeader } from '@/components/events/blocks'
import { recommend } from '@/lib/ai/recommend'
import { bucketNow, diversify, safeQueryEvents } from '@/lib/events/query'
import { ARRONDISSEMENTS, CATEGORIES } from '@/lib/events/taxonomy'
import { COLLECTIONS } from '@/lib/collections'
import { getWindow, parisDate, parisNightDay, parisParts } from '@/lib/paris-time'
import { safeJsonLd } from '@/lib/json-ld'
import { SITE_URL } from '@/lib/site'

// Anonymous, identical for everyone → static + revalidated every 5 minutes.
export const revalidate = 300

export const metadata = {
  title: { absolute: 'Paname Club · Que faire à Paris ce soir, demain ou ce week-end ?' },
  description:
    'Concerts, expos, théâtre, sorties gratuites : dis ce que tu veux faire, Paname Club te propose les meilleures idées de sortie à Paris en quelques secondes.',
  alternates: { canonical: '/' },
}

const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

/**
 * The weekend's Paris days (Friday → Sunday, from today when the weekend has
 * started). Each day gets its own small query: one query for the whole weekend
 * ranked by soonness only ever returned Friday.
 */
function weekendDays(now: Date): Array<{ key: string; label: string; iso: string }> {
  const w = getWindow('weekend', now)
  const first = parisNightDay(w.start)
  const last = parisNightDay(new Date(w.end.getTime() - 1))
  const days: Array<{ key: string; label: string; iso: string }> = []
  for (let i = 0; i < 4; i++) {
    const d = parisNightDay(parisDate(first.year, first.month, first.day + i, 12))
    const iso = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
    days.push({ key: iso, label: WEEKDAYS[d.weekday], iso })
    if (d.year === last.year && d.month === last.month && d.day === last.day) break
  }
  return days
}

export default async function HomePage() {
  const now = bucketNow()

  const days = weekendDays(now)
  const signatureBase = { signatureOnly: true, withImage: true, oneOffOnly: true, excludeCategories: ['cinema'], limit: 24 }
  const [discover, tonight, weekendPages, expos, lastChance, free, bigTonight] = await Promise.all([
    recommend({ when: 'tonight' }, 4),
    safeQueryEvents({ when: 'tonight', withImage: true, oneOffOnly: true, excludeCategories: ['cinema'], limit: 24 }),
    Promise.all(days.map((d) => safeQueryEvents({ when: d.iso, oneOffOnly: true, limit: 10 }))),
    safeQueryEvents({ categories: ['expos'], when: 'month', runsEndingWithinDays: 400, withImage: true, limit: 16 }),
    safeQueryEvents({ runsEndingWithinDays: 7, withImage: true, sort: 'ending', limit: 10 }),
    safeQueryEvents({ free: true, when: 'week', withImage: true, oneOffOnly: true, limit: 12 }),
    safeQueryEvents({ ...signatureBase, when: 'tonight' }),
  ])
  // "Les grandes scènes": tonight when there is enough, else the week. One venue each.
  const bigTonightPicks = diversify(bigTonight.events, 8)
  const bigUseWeek = bigTonightPicks.length < 4
  const bigScenes = bigUseWeek ? diversify((await safeQueryEvents({ ...signatureBase, when: 'week' })).events, 8) : bigTonightPicks

  const shown = new Set(discover.events.map((e) => e.id))
  const picks = diversify(tonight.events.filter((e) => !shown.has(e.id)), 3)
  picks.forEach((e) => shown.add(e.id))
  const program: ProgramDay[] = days.map((d, i) => ({ key: d.key, label: d.label, events: diversify(weekendPages[i].events, 6) }))
  const weekendError = weekendPages.every((p) => p.error)
  const freeWeek = diversify(free.events.filter((e) => !shown.has(e.id)), 8)
  const hour = parisParts(now).hour
  const tonightIsLate = hour >= 21 || hour < 4

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Paname Club',
    url: SITE_URL,
    inLanguage: 'fr-FR',
  }

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />

      <Discover initial={{ ...discover, query: discover.query }} nowIso={now.toISOString()} />

      {/* Tonight: the three strongest picks, ranked */}
      <section aria-labelledby="picks-title" className="px-4 pt-12">
        <SectionHeader
          id="picks-title"
          kicker={tonightIsLate ? 'Il est encore temps' : 'Notre sélection'}
          title="Le choix de ce soir"
          href="/ce-soir"
          linkLabel="Tout ce soir"
        />
        {tonight.error ? (
          <DataUnavailable className="mt-5" />
        ) : picks.length === 0 ? (
          <p className="mt-4 text-[15px] text-text-secondary">
            La soirée est bien avancée.{' '}
            <Link href="/ce-week-end" className="font-semibold text-accent underline underline-offset-2">
              Prépare plutôt ton week-end
            </Link>
            .
          </p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {picks.map((e, i) => (
              <EventCard key={e.id} event={e} variant="feature" rank={i + 1} priority={i === 0} now={now} />
            ))}
          </div>
        )}
      </section>

      <PourToiClient excludeIds={[...shown]} />

      {/* Interactive shortcuts */}
      <section aria-label="Autres façons de chercher" className="grid gap-3 px-4 pt-10 sm:grid-cols-2">
        <Link
          href="/autour-de-moi"
          className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-ink"
        >
          <MapPinned className="h-9 w-9 shrink-0 text-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-semibold text-ink">Autour de moi, maintenant</p>
            <p className="text-[14px] text-text-secondary">Ce qui commence dans les 3 heures, au plus près de toi.</p>
          </div>
          <ArrowRight className="h-5 w-5 text-text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
        <Link
          href="/surprise"
          className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-ink"
        >
          <Dices className="h-9 w-9 shrink-0 text-neon" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-semibold text-ink">Surprends-moi</p>
            <p className="text-[14px] text-text-secondary">Une seule idée, tirée au sort parmi les bonnes.</p>
          </div>
          <ArrowRight className="h-5 w-5 text-text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </section>

      {/* Weekend programme */}
      <section aria-labelledby="weekend-title" className="grid gap-8 px-4 pt-14 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <SectionHeader id="weekend-title" kicker="Le programme" title="Ce week-end" href="/ce-week-end" />
          <p className="mt-3 max-w-sm text-[15px] text-text-secondary">
            Du vendredi soir au dimanche, jour par jour. Les expositions sont dans la rubrique d’à côté.
          </p>
        </div>
        {weekendError ? <DataUnavailable /> : <WeekendProgram days={program} nowIso={now.toISOString()} />}
      </section>

      {/* Big venues: factual list in lib/venues-signature.ts */}
      {bigScenes.length > 0 && (
        <section aria-labelledby="big-title" className="px-4 pt-14">
          <SectionHeader
            id="big-title"
            kicker="Lieux phares"
            title={bigUseWeek ? 'Les grandes scènes cette semaine' : 'Les grandes scènes ce soir'}
          />
          <p className="mt-2 max-w-xl text-[15px] text-text-secondary">
            Philharmonie, Châtelet, Opéra, Olympia, Comédie-Française… ce qui s’y joue, une salle à la fois.
          </p>
          <EventRail events={bigScenes} now={now} className="mt-5" />
        </section>
      )}

      {/* Exhibitions: tall posters */}
      {expos.events.length > 0 && (
        <section aria-labelledby="expos-title" className="px-4 pt-14">
          <SectionHeader id="expos-title" kicker="À voir" title="Les expos du moment" href="/collections/expos-du-moment" />
          <EventRail events={diversify(expos.events, 12)} variant="tile" now={now} className="mt-5" />
        </section>
      )}

      {/* Last chance — vermilion */}
      {lastChance.events.length > 0 && (
        <section aria-labelledby="last-title" className="mx-[calc(50%-50vw)] mt-14 bg-neon-soft py-10">
          <div className="mx-auto max-w-7xl px-4">
            <SectionHeader id="last-title" kicker="Ça ferme bientôt" title="Dernière chance" />
            <EventRail events={lastChance.events} variant="tile" now={now} className="mt-5" />
          </div>
        </section>
      )}

      {/* Free this week */}
      {freeWeek.length > 0 && (
        <section aria-labelledby="free-title" className="px-4 pt-14">
          <SectionHeader id="free-title" kicker="0 €" title="Gratuit cette semaine" href="/gratuit" />
          <EventRail events={freeWeek} now={now} className="mt-5" />
        </section>
      )}

      {/* Collections */}
      <section aria-labelledby="collections-title" className="px-4 pt-14">
        <SectionHeader id="collections-title" kicker="Envie de…" title="Nos sélections" href="/collections" />
        <ul className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
          {COLLECTIONS.map((c) => (
            <li key={c.slug} className="bg-surface">
              <Link href={`/collections/${c.slug}`} className="block h-full p-4 transition-colors hover:bg-surface-hover">
                <span className="font-display block text-[1.5rem] text-ink">{c.title}</span>
                <span className="mt-1 block text-[13px] text-text-secondary">{c.tagline}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Browse: categories & neighbourhoods (internal linking) */}
      <section aria-labelledby="browse-title" className="grid gap-10 px-4 pt-14 md:grid-cols-2">
        <div>
          <h2 id="browse-title" className="font-display text-[2rem] text-ink">Par envie</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/categories/${c.slug}`}
                  className="inline-flex h-11 items-center rounded-full border border-border-strong bg-surface px-4 text-[15px] font-medium text-ink transition-colors hover:border-ink"
                >
                  {c.plural}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-display text-[2rem] text-ink">Par quartier</h2>
          <ul className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10 md:grid-cols-5 lg:grid-cols-10">
            {ARRONDISSEMENTS.map((a) => (
              <li key={a}>
                <Link
                  href={`/paris/${a}`}
                  className="flex h-11 items-center justify-center rounded-lg border border-border bg-surface text-[15px] font-semibold text-ink transition-colors hover:border-ink"
                >
                  {a}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {discover.events.length === 0 && picks.length === 0 && (
        <section className="px-4 pt-10">
          <EventList events={weekendPages.flatMap((p) => p.events).slice(0, 5)} now={now} />
        </section>
      )}
    </div>
  )
}
