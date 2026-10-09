import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Dices, Flame, Layers, Sparkles, Trophy } from 'lucide-react'
import { DataUnavailable, EventRail, SectionHeader } from '@/components/events/blocks'
import { bucketNow } from '@/lib/events/query'
import { ARCHETYPES } from '@/lib/taste-quiz-data'
import { BADGES } from '@/lib/gamification'
import { cn } from '@/lib/utils'
import { getSessionUser } from './_lib/api'
import { getMemberOverview, getMembersTopThisWeek } from './_lib/member'
import { getAnonymousDrop, getMemberDrop } from './_lib/drop'
import { BadgeGrid, LevelMeter, StatTiles } from './_components/member-ui'
import { LocalSync } from './_components/local-sync'
import { LocalProgress } from './_components/local-progress'
import { ChallengeCard, RankList } from './_components/community'
import { getCommunityHighlights, getWeeklyChallenge } from './_lib/community'
import { getFollowFeed } from './_lib/follows'
import { NewForYouTeaser } from '@/components/follow/follow-feed'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Le Club : Match, quiz culturel et Drop du lundi',
  description:
    'Swipe des sorties pour affiner tes goûts, découvre ton profil culturel en 2 minutes et reçois chaque lundi 5 idées de sortie à Paris choisies pour toi.',
  alternates: { canonical: '/club' },
  openGraph: {
    title: 'Le Club Paname Club',
    description: 'Match, quiz « Tu préfères », Drop du lundi et Top des membres : la partie joueuse de Paname Club.',
    url: '/club',
    type: 'website',
  },
}

interface Feature {
  href: string
  kicker: string
  title: string
  text: string
  meta: string
  cta: string
  icon: typeof Flame
  tone: 'accent' | 'neon' | 'ink'
}

const FEATURES: Feature[] = [
  {
    href: '/match',
    kicker: '01 · Match',
    title: 'Swipe tes envies',
    text: 'Une carte, un geste : ça te tente ou pas. Chaque swipe affine ce qu’on te propose.',
    meta: 'Sans compte · 30 cartes par jour',
    cta: 'Lancer Match',
    icon: Flame,
    tone: 'neon',
  },
  {
    href: '/quiz',
    kicker: '02 · Tu préfères',
    title: 'Ton profil culturel',
    text: 'Concert en cave ou festival géant ? 10 duels pour savoir quel sortant parisien tu es.',
    meta: 'Sans compte · 2 minutes',
    cta: 'Faire le quiz',
    icon: Sparkles,
    tone: 'accent',
  },
  {
    href: '/drop',
    kicker: '03 · Drop du lundi',
    title: '5 idées, chaque semaine',
    text: 'Chaque lundi, cinq sorties des 7 prochains jours choisies selon tes goûts, avec la raison de chaque choix.',
    meta: 'Personnalisé dès ton premier swipe',
    cta: 'Voir le drop',
    icon: Layers,
    tone: 'ink',
  },
  {
    href: '/top',
    kicker: '04 · Top des membres',
    title: 'Ce que le club garde',
    text: 'Les sorties les plus gardées cette semaine, et celles que les membres ont adorées.',
    meta: 'Mis à jour en continu',
    cta: 'Voir le top',
    icon: Trophy,
    tone: 'ink',
  },
]

const toneClass: Record<Feature['tone'], string> = {
  accent: 'text-accent',
  neon: 'text-neon',
  ink: 'text-ink',
}

export default async function ClubPage() {
  const now = bucketNow()
  const user = await getSessionUser()
  const [overview, drop, top, community, challenge, feed] = await Promise.all([
    user ? getMemberOverview(user.id) : Promise.resolve(null),
    (user ? getMemberDrop(user.id) : getAnonymousDrop()).catch((err) => {
      console.error('[club] drop failed', err)
      return null
    }),
    getMembersTopThisWeek().catch(() => []),
    getCommunityHighlights(),
    getWeeklyChallenge(user?.id ?? null),
    user ? getFollowFeed(user.id) : Promise.resolve(null),
  ])
  // Members' tops empty: the most saved events overall stand in (real counts only).
  const showSaved = top.length === 0 && community.mostSaved.length > 0
  // Said only when the count really came back empty (not when the query failed).
  const noMemberActivity = top.length === 0 && community.mostSaved.length === 0 && !community.savedError
  const archetype = overview?.archetype ? ARCHETYPES[overview.archetype] : null
  const firstName = overview?.name?.split(/\s+/)[0] ?? null

  return (
    <div className="px-4 pb-16 pt-8 sm:pt-12">
      <LocalSync />

      {/* Hero */}
      <header className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">Le Club</p>
          <h1 className="font-display mt-2 text-[3.2rem] text-ink sm:text-[4.6rem]">
            {firstName ? `Salut ${firstName}, on joue ?` : 'Joue, affine tes goûts, sors mieux.'}
          </h1>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-text-secondary">
            Le Club, c’est la partie joueuse de Paname Club. Plus tu joues, plus les idées de sortie qu’on te propose te
            ressemblent.
          </p>
          {!user && (
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/match"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-paper transition-colors hover:bg-ink-soft"
              >
                Jouer sans compte
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/login?next=/club"
                className="inline-flex h-12 items-center rounded-full border border-border-strong bg-surface px-5 text-[15px] font-semibold text-ink transition-colors hover:border-ink"
              >
                Créer mon compte
              </Link>
            </div>
          )}
        </div>

        {overview ? (
          <section aria-label="Ta progression" className="rounded-2xl bg-night p-5 text-paper sm:p-6">
            <LevelMeter xp={overview.xp} tone="dark" />
            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-paper/15 pt-4 text-center">
              <Link href="/compte/sauvegardes" className="rounded-lg py-1 hover:bg-paper/5">
                <span className="font-display block text-[2rem] tabular-nums">{overview.upcomingSaved}</span>
                <span className="text-[12px] text-paper/75">sorties gardées</span>
              </Link>
              <div className="py-1">
                <span className="font-display block text-[2rem] tabular-nums">{overview.stats.attendances}</span>
                <span className="text-[12px] text-paper/75">« j’y vais »</span>
              </div>
              <div className="py-1">
                <span className="font-display block text-[2rem] tabular-nums">{overview.badges.length}</span>
                <span className="text-[12px] text-paper/75">badges</span>
              </div>
            </div>
            <p className="mt-4 text-[14px] text-paper/85">
              {archetype ? (
                <>
                  Ton profil : <strong className="font-semibold text-paper">{archetype.name}</strong>.{' '}
                  <Link href="/compte/adn" className="font-semibold text-accent-glow underline underline-offset-2">
                    Voir ton ADN
                  </Link>
                </>
              ) : (
                <>
                  Pas encore de profil culturel.{' '}
                  <Link href="/quiz" className="font-semibold text-accent-glow underline underline-offset-2">
                    Fais le quiz (2 min)
                  </Link>
                </>
              )}
            </p>
          </section>
        ) : user ? (
          <DataUnavailable />
        ) : (
          <LocalProgress />
        )}
      </header>

      {/* Follows */}
      {feed && !feed.error && (
        <section aria-label="Nouveautés pour toi" className="pt-10">
          <NewForYouTeaser groups={feed.groups} followCount={feed.follows.length} />
        </section>
      )}

      {/* Games */}
      <section aria-labelledby="jeux-title" className="pt-14">
        <h2 id="jeux-title" className="sr-only">
          Les jeux du Club
        </h2>
        <ul className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
          {FEATURES.map((f) => {
            const Icon = f.icon
            const status =
              f.href === '/quiz' && archetype
                ? `Ton profil : ${archetype.name}`
                : f.href === '/match' && overview
                  ? `${overview.stats.swipes} swipes au compteur`
                  : f.meta
            return (
              <li key={f.href} className="bg-surface">
                <Link href={f.href} className="group flex h-full flex-col p-5 transition-colors hover:bg-surface-hover sm:p-6">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-text-muted">{f.kicker}</p>
                    <Icon className={cn('h-6 w-6', toneClass[f.tone])} aria-hidden />
                  </div>
                  <p className="font-display mt-3 text-[2.2rem] text-ink">{f.title}</p>
                  <p className="mt-2 max-w-md text-[15px] leading-relaxed text-text-secondary">{f.text}</p>
                  <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                    <span className="text-[13px] text-text-muted">{status}</span>
                    <span className="inline-flex h-11 items-center gap-1.5 rounded-full bg-ink px-4 text-[14px] font-semibold text-paper transition-colors group-hover:bg-accent">
                      {f.cta}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
        <Link
          href="/surprise"
          className="group mt-3 flex items-center gap-4 rounded-2xl border border-border bg-neon-soft p-5 transition-colors hover:border-neon"
        >
          <Dices className="h-9 w-9 shrink-0 text-neon" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[1.8rem] text-ink">Surprends-moi</p>
            <p className="text-[14px] text-text-secondary">Pas envie de choisir ? Une seule idée, tirée au sort parmi les bonnes.</p>
          </div>
          <ArrowRight className="h-5 w-5 text-text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </section>

      {/* Weekly challenge */}
      <section aria-labelledby="defi-title" className="pt-14">
        <SectionHeader id="defi-title" kicker="Défi de la semaine" title="Ton défi" />
        <div className="mt-5">
          <ChallengeCard data={challenge} loggedIn={!!user} />
        </div>
      </section>

      {/* Drop teaser */}
      <section aria-labelledby="drop-title" className="pt-14">
        <SectionHeader
          id="drop-title"
          kicker="Drop du lundi"
          title={drop?.personalized ? 'Ta sélection de la semaine' : 'La sélection de la semaine'}
          href="/drop"
          linkLabel="Tout le drop"
        />
        {!drop || drop.error ? (
          <DataUnavailable className="mt-5" />
        ) : drop.events.length === 0 ? (
          <p className="mt-4 text-[15px] text-text-secondary">Le drop de la semaine se prépare. Reviens un peu plus tard.</p>
        ) : (
          <EventRail events={drop.events.slice(0, 4)} now={now} className="mt-5" />
        )}
      </section>

      {/* Top teaser */}
      {top.length > 0 && (
        <section aria-labelledby="top-title" className="pt-14">
          <SectionHeader id="top-title" kicker="Top des membres" title="Le club garde ça" href="/top" linkLabel="Tout le top" />
          <ol className="mt-5 divide-y divide-border rounded-xl border border-border bg-surface">
            {top.slice(0, 3).map((t, i) => (
              <li key={t.event.id}>
                <Link
                  href={`/evenements/${t.event.slug}`}
                  className="flex items-center gap-4 p-4 transition-colors hover:bg-surface-hover"
                >
                  <span className="font-display w-8 text-[2.2rem] text-accent">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">{t.event.title}</span>
                    <span className="block text-[13px] text-text-secondary">
                      {t.saves} {t.saves > 1 ? 'membres l’ont gardé' : 'membre l’a gardé'}
                      {t.attendances > 0 && ` · ${t.attendances} y ${t.attendances > 1 ? 'vont' : 'va'}`}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* What the club looks at: real views and saves only */}
      {(showSaved || community.mostViewed.length > 0 || noMemberActivity) && (
        <section aria-labelledby="community-title" className="pt-14">
          <SectionHeader
            id="community-title"
            kicker="Le club en ce moment"
            title={showSaved ? 'Ce que le club garde et regarde' : 'Ce que le club regarde'}
            href="/top"
            linkLabel="Tout le top"
          />
          {noMemberActivity && (
            <p className="mt-3 max-w-xl text-[15px] text-text-secondary">
              Aucun membre n’a encore gardé de sortie à venir : le top se remplira avec les vôtres.{' '}
              {user ? 'Garde une sortie qui te tente et tu seras le premier.' : (
                <>
                  <Link href="/login?next=/club" className="font-semibold text-accent underline underline-offset-2">
                    Crée ton compte
                  </Link>{' '}
                  et sois le premier.
                </>
              )}
            </p>
          )}
          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            {showSaved && (
              <RankList
                title="Les plus gardées"
                items={community.mostSaved}
                unit={(n) => (n > 1 ? `${n} membres l’ont gardée` : '1 membre l’a gardée')}
              />
            )}
            {community.mostViewed.length > 0 && (
              <RankList
                title="Les sorties de la semaine les plus consultées"
                items={community.mostViewed}
                unit={(n) => `${n.toLocaleString('fr-FR')} vue${n > 1 ? 's' : ''}`}
              />
            )}
          </div>
        </section>
      )}

      {/* Badges */}
      <section aria-labelledby="badges-title" className="pt-14">
        <SectionHeader
          id="badges-title"
          kicker="Progression"
          title={overview ? `Tes badges (${overview.badges.length}/${BADGES.length})` : `${BADGES.length} badges à débloquer`}
        />
        <p className="mt-3 max-w-xl text-[15px] text-text-secondary">
          {overview
            ? 'Garde des sorties, dis « j’y vais », note ce que tu as vu : chaque action compte une seule fois, et tout se débloque en sortant vraiment.'
            : 'Ils se débloquent en gardant des sorties, en disant « j’y vais » et en notant ce que tu as vu. Il faut un compte pour les garder.'}
        </p>
        <BadgeGrid earned={overview?.badges ?? []} stats={overview?.stats ?? null} className="mt-5" />
        {overview && (
          <StatTiles
            className="mt-6"
            items={[
              { label: 'Sorties gardées', value: overview.stats.saves, href: '/compte/sauvegardes' },
              { label: 'Avis publiés', value: overview.stats.reviews },
              { label: 'Arrondissements', value: overview.stats.arrondissements },
              { label: 'Catégories', value: overview.stats.categories, href: '/compte/adn' },
            ]}
          />
        )}
        {!user && (
          <p className="mt-6 text-[15px] text-text-secondary">
            <Link href="/login?next=/club" className="font-semibold text-accent underline underline-offset-2">
              Crée ton compte en 30 secondes
            </Link>{' '}
            : tes swipes et ton profil faits sans compte sont repris automatiquement.
          </p>
        )}
      </section>
    </div>
  )
}
