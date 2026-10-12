import type { Metadata } from 'next'
import Link from 'next/link'
import { BellRing, CalendarCheck, Mail, Search, ShieldCheck, Smartphone, Ticket, UserRound } from 'lucide-react'
import { ArtistAlertSearch } from '@/components/follow/artist-alert-search'
import { TrackOnMount } from '@/components/ui/track-on-mount'
import { ALERTS_FAQ, ALERTS_LANDING_PATH, faqJsonLd } from '@/lib/alerts-landing'
import { safeJsonLd } from '@/lib/json-ld'

// Static: identical for everyone (the demo talks to cached APIs from the browser).
export const dynamic = 'force-static'

const TITLE = 'Alertes concerts à Paris : sois prévenu quand tes artistes passent'
const DESCRIPTION =
  'Gratuit : suis tes artistes et reçois une alerte dès qu’ils annoncent une date à Paris ou en petite couronne, quand la billetterie ouvre et la veille du concert.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: ALERTS_LANDING_PATH },
  openGraph: { title: 'Alertes concerts · Paname Club', description: DESCRIPTION, url: ALERTS_LANDING_PATH, type: 'website' },
}

const STEPS = [
  { icon: Search, title: 'Cherche tes artistes', text: 'Un groupe, une chanteuse, un DJ : avec ou sans date annoncée.' },
  { icon: UserRound, title: 'Crée ton alerte', text: 'Connexion avec Google ou un lien par e-mail, sans mot de passe. Ton alerte est prête dès ton retour.' },
  { icon: BellRing, title: 'Sois prévenu', text: 'Un message dès qu’il y a du nouveau à Paris pour tes artistes. Rien sinon.' },
]

const MOMENTS = [
  { icon: CalendarCheck, title: 'Nouvelle date', text: 'Ton artiste annonce un concert à Paris ou en petite couronne : tu le sais dès qu’il apparaît sur Paname Club.' },
  { icon: Ticket, title: 'Ouverture de la billetterie', text: 'Quand la date d’ouverture des ventes est connue, on te prévient à l’approche de l’ouverture des ventes.' },
  { icon: BellRing, title: 'Rappel la veille', text: 'Pour les concerts où tu as appuyé sur « J’y vais » : un rappel la veille, avec l’heure et la salle.' },
]

const PROMISES = [
  'Gratuit, sans abonnement.',
  'Un seul message groupé, uniquement quand il y a du nouveau.',
  'Désinscription en un clic, depuis chaque e-mail.',
  'Tes données ne sont jamais revendues.',
]

export default function AlertesConcertsPage() {
  return (
    <div className="px-4 pb-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd()) }} />
      <TrackOnMount event="alerts_landing_view" />

      {/* Hero + live demo */}
      <section aria-labelledby="hero-title" className="grid gap-8 pt-8 sm:pt-12 lg:grid-cols-[1.1fr_1fr] lg:items-start lg:gap-12">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">Alertes concerts</p>
          <h1 id="hero-title" className="font-display mt-2 text-[3rem] leading-[1.02] text-ink sm:text-[4.4rem]">
            Tes artistes passent à Paris ? Tu es prévenu le premier.
          </h1>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-text-secondary">
            Suis tes artistes, on surveille les nouvelles dates pour toi. C’est gratuit, à Paris et en petite couronne.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2 text-[13px] font-semibold text-ink">
            {['Gratuit', 'Paris et petite couronne', 'E-mail ou notification'].map((t) => (
              <li key={t} className="rounded-full border border-border-strong bg-surface px-3 py-1.5">
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-border bg-paper-deep p-4 sm:p-6">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-text-muted">Essaie, sans compte</p>
          <ArtistAlertSearch source="landing" className="mt-3" />
          <p className="mt-4 text-[13px] text-text-secondary">
            Déjà membre ?{' '}
            <Link href="/compte/artistes" className="font-semibold text-accent underline underline-offset-2">
              Gère tes artistes
            </Link>
          </p>
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-title" className="pt-16">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">En trois étapes</p>
        <h2 id="how-title" className="font-display mt-1 text-[2rem] text-ink sm:text-[2.6rem]">
          Comment ça marche
        </h2>
        <ol className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <li key={s.title} className="bg-surface p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="font-display flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[1.2rem] text-paper" aria-hidden>
                    {i + 1}
                  </span>
                  <Icon className="h-5 w-5 text-accent" aria-hidden />
                </div>
                <h3 className="mt-4 text-[17px] font-semibold text-ink">{s.title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-text-secondary">{s.text}</p>
              </li>
            )
          })}
        </ol>
      </section>

      {/* The three moments */}
      <section aria-labelledby="moments-title" className="pt-16">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">Au bon moment</p>
        <h2 id="moments-title" className="font-display mt-1 text-[2rem] text-ink sm:text-[2.6rem]">
          Trois alertes, pas une de plus
        </h2>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {MOMENTS.map((m) => {
            const Icon = m.icon
            return (
              <li key={m.title} className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
                <Icon className="h-7 w-7 text-accent" aria-hidden />
                <h3 className="mt-3 text-[17px] font-semibold text-ink">{m.title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-text-secondary">{m.text}</p>
              </li>
            )
          })}
        </ul>
      </section>

      {/* Channels */}
      <section aria-labelledby="channels-title" className="pt-16">
        <h2 id="channels-title" className="font-display text-[2rem] text-ink sm:text-[2.6rem]">
          Par e-mail ou sur ton téléphone
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <Mail className="h-7 w-7 text-accent" aria-hidden />
            <h3 className="mt-3 text-[17px] font-semibold text-ink">E-mail, par défaut</h3>
            <p className="mt-1 text-[15px] leading-relaxed text-text-secondary">
              Rien à régler : les alertes arrivent à l’adresse de ton compte, regroupées en un seul message.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <Smartphone className="h-7 w-7 text-accent" aria-hidden />
            <h3 className="mt-3 text-[17px] font-semibold text-ink">Notifications sur l’appareil</h3>
            <p className="mt-1 text-[15px] leading-relaxed text-text-secondary">
              À activer dans « Mes artistes », sur Android ou sur ordinateur. Sur iPhone, Apple ne les autorise qu’une fois le site
              ajouté à l’écran d’accueil (Safari : Partager, puis « Sur l’écran d’accueil »).
            </p>
          </div>
        </div>
      </section>

      {/* Commitments + coverage */}
      <section aria-labelledby="promise-title" className="mx-[calc(50%-50vw)] mt-16 bg-night py-12 text-paper">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 md:grid-cols-2">
          <div>
            <ShieldCheck className="h-8 w-8 text-accent-glow" aria-hidden />
            <h2 id="promise-title" className="font-display mt-3 text-[2rem] sm:text-[2.6rem]">
              Nos engagements
            </h2>
            <ul className="mt-4 space-y-2 text-[16px] text-paper/85">
              {PROMISES.map((p) => (
                <li key={p} className="flex gap-2">
                  <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-glow" />
                  {p}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[14px] text-paper/70">
              Le détail :{' '}
              <Link href="/confidentialite" className="font-semibold text-paper underline underline-offset-2">
                politique de confidentialité
              </Link>
              .
            </p>
          </div>
          <div>
            <h2 className="font-display text-[2rem] sm:text-[2.6rem]">Ce qu’on couvre</h2>
            <p className="mt-4 text-[16px] leading-relaxed text-paper/85">
              Les alertes reposent sur les concerts référencés sur Paname Club : nous rassemblons chaque jour les agendas de
              billetteries et d’agendas culturels (Ticketmaster, Offi, OpenAgenda…) et les programmes des salles, à Paris et en
              petite couronne.
            </p>
            <p className="mt-3 text-[16px] leading-relaxed text-paper/85">
              Nous ne voyons pas tous les concerts : une date absente de Paname Club ne déclenche pas d’alerte. Pense à vérifier
              auprès de la salle ou de la billetterie.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-title" className="mx-auto max-w-3xl pt-16">
        <h2 id="faq-title" className="font-display text-[2rem] text-ink sm:text-[2.6rem]">
          Questions fréquentes
        </h2>
        <div className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {ALERTS_FAQ.map((f) => (
            <details key={f.q} className="group">
              <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-[16px] font-semibold text-ink hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden className="text-[20px] text-text-muted transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="px-5 pb-5 text-[15px] leading-relaxed text-text-secondary">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Last call */}
      <section aria-labelledby="last-title" className="mx-auto max-w-2xl pt-16">
        <h2 id="last-title" className="font-display text-center text-[2rem] text-ink sm:text-[2.6rem]">
          Qui veux-tu ne plus rater ?
        </h2>
        <ArtistAlertSearch source="landing" className="mt-6" />
      </section>
    </div>
  )
}
