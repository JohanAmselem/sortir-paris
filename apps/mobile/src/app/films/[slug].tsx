import { useLocalSearchParams } from 'expo-router'
import { WorkScreen } from '@/components/WorkScreen'

/** Toutes les séances d'un film (comme /films/[slug] sur le site). */
export default function Film() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return <WorkScreen slug={slug} kind="film" />
}
