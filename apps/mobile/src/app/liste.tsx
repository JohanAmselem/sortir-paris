import { View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { EventResults } from '@/components/explore/EventResults'
import { T } from '@/components/ui'
import { colors } from '@/theme'

/**
 * Liste générique : /liste?params=when%3Dweek%26free%3D1&title=…&kicker=…
 * `params` est une chaîne au format des URL du site (lib/events/params.ts).
 * Sert aux collections, aux quartiers et aux « Tout voir ».
 */
export default function ListeScreen() {
  const p = useLocalSearchParams<{ params?: string; title?: string; kicker?: string; text?: string }>()
  const params = typeof p.params === 'string' ? p.params : ''
  const title = typeof p.title === 'string' && p.title ? p.title : 'Sorties'
  const kicker = typeof p.kicker === 'string' ? p.kicker : null
  const text = typeof p.text === 'string' ? p.text : null

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Stack.Screen options={{ title }} />
      <EventResults
        params={params}
        origin="liste"
        header={
          kicker || text ? (
            <View style={{ paddingTop: 8, paddingBottom: 8 }}>
              {kicker ? <T v="kicker">{kicker}</T> : null}
              {text ? (
                <T v="small" style={{ marginTop: 4 }}>
                  {text}
                </T>
              ) : null}
            </View>
          ) : null
        }
        empty={{ title: 'Rien pour le moment', text: 'Aucune sortie à venir ne correspond. Reviens bientôt : le programme change deux fois par jour.' }}
      />
    </View>
  )
}
