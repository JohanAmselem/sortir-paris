import Image from 'next/image'
import Link from 'next/link'
import { CATEGORY_BY_SLUG } from '@/lib/events/taxonomy'
import { monthTitle } from '@/lib/agenda-view'
import { nextMonthKeys } from '@/lib/paris-time'

const CATEGORIES = ['concerts', 'theatre', 'spectacles', 'expos', 'soirees'] as const

const SITE = [
  { href: '/alertes-concerts', label: 'Alertes concerts' },
  { href: '/lieux', label: 'Les lieux' },
  { href: '/confidentialite', label: 'Confidentialité' },
  { href: '/mentions-legales', label: 'Mentions légales' },
  { href: '/suppression-compte', label: 'Supprimer mon compte' },
]

/** Pied de page réduit : une quinzaine de liens utiles (l'Agenda, quelques mois, les grandes catégories). */
export function Footer() {
  const now = new Date()
  const months = nextMonthKeys(4, now).slice(1)
  const agenda = [
    { href: '/agenda', label: 'Tout l’agenda' },
    ...months.map((m) => ({ href: `/agenda/${m}`, label: monthTitle(m, now) })),
  ]
  const categories = CATEGORIES.map((slug) => ({ href: `/categories/${slug}`, label: CATEGORY_BY_SLUG[slug].plural }))

  return (
    <footer className="mt-20 border-t border-border bg-surface-dark">
      <div className="mx-auto max-w-7xl px-4 pb-28 pt-12 md:pb-12">
        <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <p className="flex items-center gap-3">
              <Image src="/brand/logo-mark-light.svg" alt="" width={40} height={42} unoptimized className="h-[40px] w-auto" />
              <Image src="/brand/logo-wordmark-light.svg" alt="Paname Club" width={170} height={18} unoptimized className="h-[16px] w-auto" />
            </p>
            <p className="t-small mt-3 max-w-xs text-text-secondary">Que faire à Paris ce soir, ce week-end ou dans six mois : toutes les sorties, jour par jour.</p>
          </div>
          <FooterList title="Agenda" links={agenda} />
          <FooterList title="Sortir" links={categories} />
          <FooterList title="Paname Club" links={SITE} />
        </div>
        <div className="t-small mt-10 flex flex-col gap-3 border-t border-border pt-6 text-text-muted md:flex-row md:items-center md:justify-between">
          <p className="max-w-3xl">
            © {now.getFullYear()} Paname Club. Informations issues des agendas officiels et des sites des lieux : vérifie horaires et tarifs auprès de l’organisateur.
          </p>
          <a href="mailto:contact@panameclub.fr" className="inline-flex min-h-11 shrink-0 items-center font-semibold text-text-secondary underline-offset-2 hover:text-ink hover:underline">
            contact@panameclub.fr
          </a>
        </div>
      </div>
    </footer>
  )
}

function FooterList({ title, links }: { title: string; links: Array<{ href: string; label: string }> }) {
  return (
    <div>
      <h2 className="t-micro text-text-muted">{title}</h2>
      <ul className="mt-3">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="t-small inline-flex min-h-11 items-center text-text-secondary transition-colors hover:text-ink">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
