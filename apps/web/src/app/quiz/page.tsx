import type { Metadata } from 'next'
import { QuizGame } from './quiz-game'
import { LocalSync } from '@/app/club/_components/local-sync'

export const metadata: Metadata = {
  title: 'Tu préfères : découvre ton profil culturel en 2 minutes',
  description:
    'Concert en cave ou festival géant ? 10 duels pour découvrir ton profil de sortant parisien : explorateur nocturne, esthète confidentiel, fêtard culturel… et toi ?',
  alternates: { canonical: '/quiz' },
  openGraph: {
    title: 'Tu préfères : le quiz culturel Paname Club',
    description: '10 duels, 2 minutes, ton profil de sortant parisien.',
    url: '/quiz',
    type: 'website',
  },
}

export default function QuizPage() {
  return (
    <div className="px-4 pb-16 pt-8">
      <LocalSync />
      <header className="mx-auto max-w-xl text-center">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">Le Club · Quiz</p>
        <h1 className="font-display mt-2 text-[3rem] text-ink sm:text-[3.8rem]">Tu préfères ?</h1>
      </header>
      <QuizGame />
    </div>
  )
}
