import { Metadata } from 'next'
import { QuizGame } from './quiz-game'

export const metadata: Metadata = {
  title: 'Tu préfères — Découvre ton profil culturel | Paname Club',
  description: 'Réponds à 40 questions fun pour découvrir ton archétype culturel. Explorateur nocturne, esthète confidentiel, fêtard culturel... et toi, tu es qui ?',
  alternates: { canonical: '/quiz' },
  openGraph: {
    title: 'Tu préfères — Quiz culturel Paname Club',
    description: '40 questions pour révéler ta personnalité culturelle parisienne',
    type: 'website',
  },
}

export default function QuizPage() {
  return <QuizGame />
}
