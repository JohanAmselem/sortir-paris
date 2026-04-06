import { Metadata } from 'next'
import { MatchGame } from './match-game'

export const metadata: Metadata = {
  title: 'Match Culturel — Trouve ta sortie idéale',
  description: 'Swipe pour découvrir les événements qui te correspondent. Like = sauvegardé. 15 swipes par jour.',
}

export default function MatchPage() {
  return <MatchGame />
}
