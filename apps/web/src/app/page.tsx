import Link from 'next/link'
import { ArrowRight, BellRing } from 'lucide-react'
import { HomeTop } from '@/components/home/home-top'
import { DataUnavailable, EventList, EventRail, SectionHeader } from '@/components/events/blocks'
import { EventImage } from '@/components/ui/event-image'
import { getHomeV2 } from '@/lib/home-v2'
import { agendaHref } from '@/lib/agenda-view'
import { getWindow, parisParts } from '@/lib/paris-time'
import { safeJsonLd } from '@/lib/json-ld'
import { SITE_URL } from '@/lib/site'
import type { EnvieTile, HomeV2Response, HomeWhen } from '@/lib/api-v2/contract'

// Anonyme, le même pour tout le monde : statique, régénéré toutes les 5 minutes.
export const revalidate = 300

export const metadata = {
  title: { absolute: 'Paname Club · Que faire à Paris ce soir, ce week-end ou plus tard ?' },
  description:
    'Concerts, expos, théâtre, sorties gratuites : notre choix pour ce soir à Paris, les grosses dates des mois à venir et tout l’agenda, jour par jour.',
  alternates: { canonical: '/' },
}

const fmtDay = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' })
const fmtWeekday = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric' })
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** « Lundi 23 novembre », « Mardi 24 novembre », « Du vendredi 27 au dimanche 29 novembre ». */
function dateLines(now: Date): Record<HomeWhen, string> {
  const tonight = getWindow('tonight', now)
  const tomorrow = getWindow('tomorrow', now)
  const weekend = getWindow('weekend', now)
  const lastDay = new Date(weekend.end.getTime() - 6 * 3600_000)
  const sameMonth = parisParts(weekend.start).month === parisParts(lastDay).month
  return {
    tonight: cap(fmtDay.format(tonight.start)),
    tomorrow: cap(fmtDay.format(tomorrow.start)),
    weekend: `Du ${(sameMonth ? fmtWeekday : fmtDay).format(weekend.start)} au ${fmtDay.format(lastDay)}`,
  }
}

/** Une envie mène à sa page : la catégorie indexable quand il y en a une, sinon l'Agenda filtré. */
function envieHref(t: EnvieTile): string {
  if (t.slug === 'gratuit') return '/gratuit'
  const p = new URLSearchParams(t.params)
  const cat = p.get('cat')
  if (cat && !cat.includes(',') && [...p.keys()].length === 1) return `/categories/${cat}`
  return agendaHref(p)
}

const EMPTY: HomeV2Response = {
  generatedAt: '',
  when: 'tonight',
  whenLabel: 'Ce soir',
  count: 0,
  picks: [],
  envies: [],
  weekend: [],
  bigDates: [],
  expos: [],
}

export default async function HomePage() {
  let home = EMPTY
  let failed = false
  try {
    home = await getHomeV2('tonight')
  } catch (err) {
    console.error('[accueil]', err)
    failed = true
  }
  const now = home.generatedAt ? new Date(home.generatedAt) : new Date()
  const lastBig = home.bigDates.at(-1)
  const bigUntil = lastBig ? parisParts(new Date(lastBig.startDate)).year : null

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Paname Club',
    url: SITE_URL,
    inLanguage: 'fr-FR',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/agenda?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  }

  return (
    <div className="pb-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />

      <HomeTop initial={{ when: home.when, picks: home.picks, count: home.count }} dateLines={dateLines(now)} nowIso={now.toISOString()} />
      {failed && <DataUnavailable className="mx-4 mt-6" />}

      {home.envies.length > 0 && (
        <section aria-labelledby="envies-titre" className="px-4 pt-12">
          <SectionHeader id="envies-titre" title="Par envie" />
          <ul className="mt-4 grid grid-cols-3 gap-2 md:grid-cols-6 md:gap-3">
            {home.envies.map((t) => (
              <li key={t.slug}>
                <Link href={envieHref(t)} className="group relative block h-24 overflow-hidden rounded-xl bg-surface md:h-32">
                  <EventImage src={t.imageUrl} alt="" bare sizes="(max-width: 768px) 33vw, 200px" className="transition-transform duration-500 group-hover:scale-[1.05]" />
                  <span className="absolute inset-0 bg-linear-to-b from-surface-dark/10 to-surface-dark/75" aria-hidden />
                  <span className="t-small absolute inset-x-2.5 bottom-2 font-bold leading-tight text-ink">{t.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {home.weekend.length > 0 && (
        <section aria-labelledby="weekend-titre" className="px-4 pt-12">
          <SectionHeader id="weekend-titre" title="Ce week-end" href="/ce-week-end" linkLabel="Tout le week-end" />
          <EventRail events={home.weekend.slice(0, 8)} now={now} className="mt-4" />
        </section>
      )}

      {home.bigDates.length > 0 && (
        <section aria-labelledby="grosses-dates-titre" className="px-4 pt-12">
          <SectionHeader
            id="grosses-dates-titre"
            title="Les grosses dates"
            sub={bigUntil && bigUntil > parisParts(now).year ? `Les grandes salles, jusqu’en ${bigUntil}` : 'Les grandes salles, des mois à l’avance'}
            href="/agenda"
            linkLabel="Agenda"
          />
          <EventRail events={home.bigDates.slice(0, 10)} now={now} dateBox className="mt-4" />
        </section>
      )}

      {home.expos.length > 0 && (
        <section aria-labelledby="expos-titre" className="px-4 pt-12">
          <SectionHeader id="expos-titre" title="Expos du moment" href="/categories/expos" linkLabel="Toutes" />
          <EventList events={home.expos.slice(0, 6)} now={now} className="mt-2 md:grid md:grid-cols-2 md:gap-x-8 md:divide-y-0" />
        </section>
      )}

      <section aria-labelledby="alertes-titre" className="px-4 pt-12">
        <div className="overflow-hidden rounded-2xl bg-linear-to-br from-accent-strong/55 via-night-soft to-surface p-6 md:flex md:items-center md:justify-between md:gap-8 md:p-8">
          <div>
            <p className="t-micro flex items-center gap-2 text-accent-glow">
              <BellRing className="h-4 w-4" aria-hidden /> Alertes concerts
            </p>
            <h2 id="alertes-titre" className="t-title2 mt-2 text-ink">
              Ne rate plus tes artistes
            </h2>
            <p className="t-body mt-2 max-w-md text-ink-soft">Une notification dès qu’ils annoncent une date à Paris, et la veille du concert. Gratuit.</p>
          </div>
          <Link
            href="/alertes-concerts"
            className="t-body mt-5 inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-ink px-5 font-bold text-paper transition-colors hover:bg-ink-soft md:mt-0"
          >
            Choisir mes artistes
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  )
}
