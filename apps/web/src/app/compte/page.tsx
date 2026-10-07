import type { Metadata } from 'next'
import Link from 'next/link'
import { Bookmark, ChevronRight, Dna, Settings, Sparkles } from 'lucide-react'
import { DataUnavailable } from '@/components/events/blocks'
import { ARCHETYPES } from '@/lib/taste-quiz-data'
import { requireUser } from '@/app/club/_lib/api'
import { getMemberOverview } from '@/app/club/_lib/member'
import { BadgeGrid, LevelMeter, StatTiles } from '@/app/club/_components/member-ui'
import { LogoutButton } from './_components/logout-button'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mon compte',
  robots: { index: false, follow: false },
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', month: 'long', year: 'numeric' })

export default async function ComptePage() {
  const user = await requireUser('/compte')
  const overview = await getMemberOverview(user.id)
  const name = overview?.name ?? user.email?.split('@')[0] ?? 'Membre'
  const archetype = overview?.archetype ? ARCHETYPES[overview.archetype] : null

  const links = [
    {
      href: '/compte/sauvegardes',
      icon: Bookmark,
      label: 'Mes sorties',
      desc: overview ? `${overview.upcomingSaved} à venir` : 'Tes événements gardés',
    },
    { href: '/compte/adn', icon: Dna, label: 'Mon ADN culturel', desc: archetype ? archetype.name : 'Ce que tu aimes vraiment' },
    { href: '/club', icon: Sparkles, label: 'Le Club', desc: 'Match, quiz, Drop du lundi' },
    { href: '/compte/parametres', icon: Settings, label: 'Préférences', desc: 'Catégories, ambiances, quartiers' },
  ]

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:pt-12">
      <header className="flex items-center gap-4">
        <span
          className="font-display flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent text-[2rem] text-paper"
          aria-hidden
        >
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="font-display truncate text-[2.6rem] text-ink">{name}</h1>
          <p className="truncate text-[14px] text-text-secondary">
            {user.email}
            {overview?.memberSince && ` · membre depuis ${dateFmt.format(new Date(overview.memberSince))}`}
          </p>
        </div>
      </header>

      {overview ? (
        <>
          <LevelMeter xp={overview.xp} className="mt-8 rounded-2xl border border-border bg-surface p-5" />
          <StatTiles
            className="mt-4"
            items={[
              { label: 'Sorties gardées', value: overview.stats.saves, href: '/compte/sauvegardes' },
              { label: '« J’y vais »', value: overview.stats.attendances },
              { label: 'Avis', value: overview.stats.reviews },
              { label: 'Swipes', value: overview.stats.swipes, href: '/match' },
            ]}
          />
        </>
      ) : (
        <DataUnavailable className="mt-8" />
      )}

      <nav aria-label="Mon compte" className="mt-8">
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {links.map((l) => {
            const Icon = l.icon
            return (
              <li key={l.href}>
                <Link href={l.href} className="flex min-h-[64px] items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-hover">
                  <Icon className="h-5 w-5 shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink">{l.label}</span>
                    <span className="block truncate text-[13px] text-text-secondary">{l.desc}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-text-muted" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {overview && (
        <section aria-labelledby="badges-title" className="mt-10">
          <h2 id="badges-title" className="font-display text-[2rem] text-ink">
            Badges
          </h2>
          <BadgeGrid earned={overview.badges} stats={overview.stats} className="mt-4" />
        </section>
      )}

      <div className="mt-10">
        <LogoutButton />
      </div>
    </div>
  )
}
