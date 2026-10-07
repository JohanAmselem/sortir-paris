import type { Metadata } from 'next'
import { MatchGame } from './match-game'
import { LocalSync } from '@/app/club/_components/local-sync'

export const metadata: Metadata = {
  title: 'Match : swipe les sorties à Paris',
  description:
    'Ça te tente ou pas ? Swipe des concerts, expos et spectacles à Paris pour affiner tes goûts. Sans compte, en quelques secondes.',
  alternates: { canonical: '/match' },
}

export default function MatchPage() {
  return (
    <div className="px-4 pb-16 pt-8">
      <LocalSync />
      <header className="mx-auto max-w-md text-center">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-neon">Le Club · Match</p>
        <h1 className="font-display mt-2 text-[3rem] text-ink sm:text-[3.6rem]">Ça te tente ?</h1>
        <p className="mt-2 text-[15px] text-text-secondary">
          Swipe à droite si tu irais, à gauche sinon. Tes réponses affinent ton Drop du lundi.
        </p>
      </header>
      <MatchGame />
    </div>
  )
}
