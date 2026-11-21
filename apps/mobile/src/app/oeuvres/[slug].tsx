import { useLocalSearchParams } from 'expo-router'
import { WorkScreen } from '@/components/WorkScreen'

/** Toutes les dates d'une œuvre (comme /oeuvres/[slug] sur le site). */
export default function Oeuvre() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return <WorkScreen slug={slug} kind="work" />
}
