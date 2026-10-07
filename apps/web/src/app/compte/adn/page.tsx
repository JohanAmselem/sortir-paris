import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { DataUnavailable, EmptyState } from '@/components/events/blocks'
import { CATEGORY_BY_SLUG } from '@/lib/events/taxonomy'
import { ARCHETYPES, DIMENSION_LABELS, DIMENSIONS } from '@/lib/taste-quiz-data'
import { requireUser } from '@/app/club/_lib/api'
import { getTasteDna, type TasteDna } from '@/app/club/_lib/member'
import { BackLink } from '../_components/back-link'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mon ADN culturel',
  robots: { index: false, follow: false },
}

export default async function AdnPage() {
  const user = await requireUser('/compte/adn')
  let dna: TasteDna | null = null
  try {
    dna = await getTasteDna(user.id)
  } catch (err) {
    console.error('[compte/adn] failed', err)
  }
  const arch = dna?.profile ? ARCHETYPES[dna.profile.archetype] : null

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6">
      <BackLink />
      <h1 className="font-display mt-2 text-[3rem] text-ink sm:text-[3.6rem]">Mon ADN culturel</h1>
      <p className="mt-1 text-[15px] text-text-secondary">Ton profil du quiz, et ce que tu gardes, swipes et notes vraiment.</p>

      {!dna ? (
        <DataUnavailable className="mt-8" />
      ) : (
        <>
          {/* Quiz profile */}
          {dna.profile && arch ? (
            <section aria-labelledby="profile-title" className="mt-8 rounded-2xl bg-night p-6 text-paper">
              <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent-glow">Ton profil</p>
              <h2 id="profile-title" className="font-display mt-2 text-[2.6rem]">
                {arch.name}
              </h2>
              <p className="mt-1 text-[16px] font-semibold text-accent-glow">{arch.tagline}</p>
              <p className="mt-3 text-[15px] leading-relaxed text-paper/85">{arch.description}</p>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                {DIMENSIONS.map((d) => {
                  const meta = DIMENSION_LABELS[d]
                  const v = dna.profile!.scores[d]
                  return (
                    <li key={d}>
                      <div className="flex justify-between text-[12px] text-paper/70">
                        <span>{meta.low}</span>
                        <span className="font-semibold text-paper">{meta.label}</span>
                        <span>{meta.high}</span>
                      </div>
                      <div className="relative mt-1.5 h-2 rounded-full bg-paper/15" role="img" aria-label={`${meta.label} : ${v} sur 100`}>
                        <span
                          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-night bg-accent-glow"
                          style={{ left: `${v}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
              <Link href="/quiz" className="mt-6 inline-flex h-11 items-center gap-1.5 text-[14px] font-semibold text-accent-glow">
                Affiner ou refaire le quiz
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </section>
          ) : (
            <section className="mt-8 rounded-2xl border border-accent bg-accent-soft p-6">
              <p className="font-display text-[2rem] text-ink">Ton profil t’attend</p>
              <p className="mt-1 text-[15px] text-text-secondary">10 duels « Tu préfères », 2 minutes, et ton Drop du lundi s’y adapte.</p>
              <Link
                href="/quiz"
                className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-full bg-ink px-5 text-[14px] font-semibold text-paper"
              >
                Faire le quiz
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </section>
          )}

          {/* Real behaviour */}
          <section aria-labelledby="cats-title" className="mt-10">
            <h2 id="cats-title" className="font-display text-[2rem] text-ink">
              Ce que tu aimes vraiment
            </h2>
            {dna.categories.length === 0 ? (
              <EmptyState
                className="mt-4"
                title="Pas encore assez de données"
                actions={[
                  { href: '/match', label: 'Swiper des sorties' },
                  { href: '/evenements', label: 'Explorer l’agenda' },
                ]}
              >
                Garde des sorties, swipe dans Match ou note ce que tu as vu : ta répartition apparaîtra ici.
              </EmptyState>
            ) : (
              <>
                <p className="mt-1 text-[14px] text-text-secondary">
                  Sur {dna.totalInteractions} interaction{dna.totalInteractions > 1 ? 's' : ''} : sorties gardées, « j’y vais »,
                  coups de cœur et avis positifs.
                </p>
                <ul className="mt-5 space-y-3">
                  {dna.categories.map((c) => (
                    <li key={c.slug}>
                      <Link href={`/categories/${c.slug}`} className="group block">
                        <div className="flex items-baseline justify-between gap-3 text-[15px]">
                          <span className="font-semibold text-ink group-hover:underline">
                            {CATEGORY_BY_SLUG[c.slug]?.plural ?? c.name}
                          </span>
                          <span className="tabular-nums text-text-secondary">{c.percentage} %</span>
                        </div>
                        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-paper-deep" aria-hidden>
                          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(c.percentage, 3)}%` }} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
