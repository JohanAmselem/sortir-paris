import Link from 'next/link'
import { ARRONDISSEMENTS, CATEGORIES } from '@/lib/events/taxonomy'

const DISCOVER = [
  { href: '/ce-soir', label: 'Que faire ce soir' },
  { href: '/ce-week-end', label: 'Sorties ce week-end' },
  { href: '/gratuit', label: 'Sorties gratuites' },
  { href: '/carte', label: 'Carte des sorties' },
  { href: '/autour-de-moi', label: 'Autour de moi, maintenant' },
  { href: '/collections', label: 'Nos sélections' },
  { href: '/lieux', label: 'Lieux culturels' },
]

const CLUB = [
  { href: '/club', label: 'Le Club' },
  { href: '/surprise', label: 'Surprends-moi' },
  { href: '/match', label: 'Match culturel' },
  { href: '/quiz', label: 'Quiz « Tu préfères »' },
  { href: '/news', label: 'Le journal' },
  { href: '/newsletter', label: 'Newsletter' },
]

export function Footer() {
  return (
    <footer className="mt-16 bg-night text-paper/75">
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <p className="font-display text-[2rem] text-paper">
              PANAME<span className="font-light text-accent-glow">CLUB</span>
            </p>
            <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-paper/75">
              Les meilleures idées de sortie à Paris, choisies chaque jour parmi des milliers d’événements.
            </p>
          </div>

          <FooterList title="Découvrir" links={DISCOVER} />
          <FooterList
            title="Catégories"
            links={CATEGORIES.map((c) => ({ href: `/categories/${c.slug}`, label: c.plural }))}
          />
          <FooterList title="Le Club" links={CLUB} />
        </div>

        <div className="mt-12">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-paper/60">Par arrondissement</h2>
          <ul className="mt-3 flex flex-wrap gap-x-1 gap-y-1">
            {ARRONDISSEMENTS.map((arr) => (
              <li key={arr}>
                <Link
                  href={`/paris/${arr}`}
                  className="inline-flex h-10 min-w-10 items-center justify-center rounded px-2 text-[14px] text-paper/75 transition-colors hover:bg-paper/10 hover:text-paper"
                >
                  {arr}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-12 border-t border-paper/10 pt-6 text-[13px] text-paper/60">
          © {new Date().getFullYear()} Paname Club. Informations issues des agendas officiels et des sites des lieux :
          vérifie toujours horaires et tarifs auprès de l’organisateur.
        </p>
      </div>
    </footer>
  )
}

function FooterList({ title, links }: { title: string; links: Array<{ href: string; label: string }> }) {
  return (
    <div>
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-paper/60">{title}</h2>
      <ul className="mt-4">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="inline-flex min-h-10 items-center text-[15px] text-paper/80 transition-colors hover:text-paper">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
