import type { Metadata } from 'next'
import Link from 'next/link'
import { Bookmark, ChevronRight, Mic2, Settings, UserX } from 'lucide-react'
import { requireUser } from '@/lib/member/api'
import { getMemberOverview } from '@/lib/member/member'
import { getFollowFeed } from '@/lib/member/follows'
import { bucketNow } from '@/lib/events/query'
import { LogoutButton } from './_components/logout-button'
import { FollowsSection } from './_components/follows-section'
import { AlertsPromoCard } from '@/components/follow/alerts-promo-card'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mon compte',
  robots: { index: false, follow: false },
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', month: 'long', year: 'numeric' })

export default async function ComptePage() {
  const user = await requireUser('/compte')
  const [overview, feed] = await Promise.all([getMemberOverview(user.id), getFollowFeed(user.id)])
  const now = bucketNow()
  const name = overview?.name ?? user.email?.split('@')[0] ?? 'Membre'
  const artistCount = feed.follows.filter((f) => f.kind === 'artist').length

  const links = [
    { href: '/mes-sorties', icon: Bookmark, label: 'Mes sorties', desc: overview ? `${overview.upcomingSaved} à venir` : 'Gardées et « J’y vais »' },
    { href: '/compte/artistes', icon: Mic2, label: 'Mes artistes', desc: 'Nouvelles dates, billetteries, rappels' },
    { href: '/compte/parametres', icon: Settings, label: 'Réglages', desc: 'Catégories, quartiers, compte' },
    { href: '/suppression-compte', icon: UserX, label: 'Supprimer mon compte', desc: 'Et toutes mes données' },
  ]

  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-6 md:pt-10">
      <header className="min-w-0">
        <h1 className="t-display truncate text-ink">{name}</h1>
        <p className="t-small mt-1 truncate text-text-secondary">
          {user.email}
          {overview?.memberSince && ` · membre depuis ${dateFmt.format(new Date(overview.memberSince))}`}
        </p>
      </header>

      <nav aria-label="Mon compte" className="mt-8">
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {links.map((l) => {
            const Icon = l.icon
            return (
              <li key={l.href}>
                <Link href={l.href} className="flex min-h-16 items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-hover">
                  <Icon className="h-5 w-5 shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="t-body block font-semibold text-ink">{l.label}</span>
                    <span className="t-small block truncate text-text-muted">{l.desc}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-text-muted" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <AlertsPromoCard
        member
        className="mt-6"
        text={
          feed.error
            ? undefined
            : artistCount > 0
              ? `${artistCount} artiste${artistCount > 1 ? 's' : ''} suivi${artistCount > 1 ? 's' : ''} : nouvelles dates à Paris, billetteries, rappel la veille.`
              : 'Ajoute tes artistes : on te prévient dès qu’ils annoncent une date à Paris.'
        }
      />

      <FollowsSection feed={feed} now={now} />

      <div className="mt-10">
        <LogoutButton />
      </div>
    </div>
  )
}
