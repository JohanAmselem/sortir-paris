/**
 * Le Drop du lundi : 5 idées pour la semaine, chacune avec sa raison.
 * Personnalisé selon les goûts du membre (quiz, swipes, sorties gardées) ;
 * sinon une sélection générale et une invitation au quiz. GET /api/drop.
 */
import { useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { ARCHETYPES } from '@/shared'
import { useDrop } from '@/lib/queries'
import { useSession } from '@/lib/auth'
import { errorMessage } from '@/lib/api'
import { plural, weekLabel } from '@/lib/club'
import { Button, EmptyState, ErrorState, Loading, Notice, T } from '@/components/ui'
import { EventCard } from '@/components/EventCard'
import { colors, fonts, GUTTER } from '@/theme'

export default function DropScreen() {
  const insets = useSafeAreaInsets()
  const session = useSession()
  const drop = useDrop()
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async () => {
    setRefreshing(true)
    await drop.refetch().catch(() => {})
    setRefreshing(false)
  }

  if (drop.isPending) return <Loading label="On prépare ton Drop…" />
  if (drop.isError && !drop.data) return <ErrorState message={errorMessage(drop.error)} onRetry={() => drop.refetch()} />
  const data = drop.data!
  const [first, ...rest] = data.events
  const archetype = data.archetype ? ARCHETYPES[data.archetype] : null

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.paper }}
      contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}>
      <View style={{ paddingHorizontal: GUTTER }}>
        <T v="kicker">{weekLabel(data.weekStart) ?? 'Cette semaine'}</T>
        <T v="h1" accessibilityRole="header" style={{ marginTop: 4 }}>
          Ton Drop du lundi
        </T>
        <Text style={styles.lead}>
          {data.personalized
            ? `Cinq idées choisies selon tes goûts${archetype ? ` de ${archetype.name.toLowerCase()}` : ''}.`
            : 'Cinq idées pour ta semaine à Paris, choisies parmi les meilleures sorties.'}
        </Text>
      </View>

      {!data.personalized ? (
        <View style={{ marginTop: 14 }}>
          <Notice text="Fais le quiz « Tu préfères » : ton prochain Drop sera à ton image." />
          <View style={{ paddingHorizontal: GUTTER }}>
            <Button label="Faire le quiz" kind="secondary" compact onPress={() => router.push('/quiz')} style={{ alignSelf: 'flex-start' }} />
          </View>
        </View>
      ) : null}

      {!first ? (
        <EmptyState
          title="Pas de Drop cette semaine"
          text="Nous n’avons pas trouvé assez de sorties pour toi. Reviens un peu plus tard, ou explore ce soir."
          action={<Button label="Voir ce soir" kind="secondary" onPress={() => router.navigate('/')} />}
        />
      ) : (
        <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
          <EventCard event={first} variant="feature" rank={1} origin="drop" />
          <View style={{ marginTop: 12 }}>
            {rest.map((e, i) => (
              <EventCard key={e.id} event={e} variant="row" rank={i + 2} origin="drop" />
            ))}
          </View>
          {data.ended ? (
            <Text style={styles.ended}>{plural(data.ended, 'idée de ce Drop est déjà passée', 'idées de ce Drop sont déjà passées')}.</Text>
          ) : null}
        </View>
      )}

      {!session ? (
        <View style={{ paddingHorizontal: GUTTER, marginTop: 28 }}>
          <T v="small">Avec un compte, ton Drop arrive chaque lundi matin en notification, et tu gardes tes idées sur tous tes appareils.</T>
          <Button label="Rejoindre le Club" onPress={() => router.push('/connexion')} style={{ marginTop: 12, alignSelf: 'flex-start' }} />
        </View>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  lead: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: colors.textSecondary, marginTop: 8 },
  ended: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted, marginTop: 10 },
})
