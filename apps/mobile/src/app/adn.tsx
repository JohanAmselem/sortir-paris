/**
 * Mon ADN culturel : archétype du quiz, 8 dimensions, catégories préférées
 * (d'après les sorties gardées, « j'y vais » et swipes), niveau et XP.
 * Réservé aux membres connectés (GET /api/profile/adn).
 */
import { useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { ARCHETYPES } from '@/shared'
import { useAdn } from '@/lib/queries'
import { useSession } from '@/lib/auth'
import { errorMessage } from '@/lib/api'
import { plural } from '@/lib/club'
import { Button, Card, EmptyState, ErrorState, Loading, SectionHeader, T } from '@/components/ui'
import { DimensionBars } from '@/components/club/DimensionBars'
import { ProgressBar } from '@/components/club/parts'
import { colors, fonts, GUTTER, radius } from '@/theme'

export default function AdnScreen() {
  const session = useSession()
  if (!session) {
    return (
      <EmptyState
        title="Ton ADN culturel"
        text="Connecte-toi pour voir ton profil, tes catégories préférées et ton niveau. Tu peux déjà faire le quiz sans compte."
        action={
          <View style={{ gap: 10, alignItems: 'center' }}>
            <Button label="Me connecter" onPress={() => router.push('/connexion')} />
            <Button label="Faire le quiz" kind="secondary" onPress={() => router.push('/quiz')} />
          </View>
        }
      />
    )
  }
  return <Adn />
}

function Adn() {
  const insets = useSafeAreaInsets()
  const adn = useAdn()
  const [refreshing, setRefreshing] = useState(false)
  const refresh = async () => {
    setRefreshing(true)
    await adn.refetch().catch(() => {})
    setRefreshing(false)
  }

  if (adn.isPending) return <Loading label="On lit ton ADN…" />
  if (adn.isError && !adn.data) return <ErrorState message={errorMessage(adn.error)} onRetry={() => adn.refetch()} />
  const data = adn.data!
  const archetype = data.profile ? ARCHETYPES[data.profile.archetype] : null
  const toNext = data.nextLevel ? Math.max(0, data.nextLevel.minXp - data.xp) : 0

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.paper }}
      contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}>
      <View style={{ paddingHorizontal: GUTTER }}>
        {archetype && data.profile ? (
          <View style={styles.hero}>
            <Text style={styles.heroEmoji} accessibilityElementsHidden importantForAccessibility="no">
              {archetype.emoji}
            </Text>
            <T v="kicker" style={{ color: colors.accentGlow, marginTop: 8 }}>
              Ton profil
            </T>
            <Text style={styles.heroTitle} accessibilityRole="header">
              {archetype.name}
            </Text>
            <Text style={styles.heroTagline}>{archetype.tagline}</Text>
            <Text style={styles.heroText}>{data.profile.summary || archetype.description}</Text>
            <Button label="Refaire le quiz" kind="light" compact onPress={() => router.push('/quiz')} style={{ marginTop: 16, alignSelf: 'flex-start' }} />
          </View>
        ) : (
          <Card>
            <T v="h3">Pas encore de profil</T>
            <T v="small" style={{ marginTop: 6 }}>
              Réponds au quiz « Tu préfères » : 10 questions, 2 minutes, et ton Drop du lundi s’adapte à toi.
            </T>
            <Button label="Faire le quiz" onPress={() => router.push('/quiz')} style={{ marginTop: 14, alignSelf: 'flex-start' }} />
          </Card>
        )}
      </View>

      <View style={styles.block}>
        <SectionHeader kicker="Ton niveau" title={`${data.level.level} · ${data.level.name}`} />
        <View style={{ paddingHorizontal: GUTTER }}>
          <Card>
            <Text style={styles.xp}>{data.xp} XP</Text>
            <View style={{ marginTop: 10 }}>
              <ProgressBar value={data.xpProgress} label={`Progression vers le niveau suivant : ${data.xpProgress} %`} />
            </View>
            <T v="small" style={{ marginTop: 8 }}>
              {data.nextLevel ? `Encore ${toNext} XP avant « ${data.nextLevel.name} ».` : 'Niveau maximal atteint.'}{' '}
              {plural(data.badges.length, 'badge obtenu', 'badges obtenus')}.
            </T>
          </Card>
        </View>
      </View>

      {data.profile ? (
        <View style={styles.block}>
          <SectionHeader kicker="Tes 8 dimensions" title="Ce qui te ressemble" />
          <View style={{ paddingHorizontal: GUTTER }}>
            <Card>
              <DimensionBars scores={data.profile.scores} />
            </Card>
          </View>
        </View>
      ) : null}

      <View style={styles.block}>
        <SectionHeader kicker="D’après tes sorties" title="Tes catégories" />
        <View style={{ paddingHorizontal: GUTTER }}>
          {data.categories.length ? (
            <Card>
              {data.categories.slice(0, 8).map((c) => (
                <View key={c.slug} style={{ marginBottom: 12 }} accessible accessibilityLabel={`${c.name} : ${c.percentage} %`}>
                  <View style={styles.catLine}>
                    <Text style={styles.catName}>{c.name}</Text>
                    <Text style={styles.catPct}>{c.percentage} %</Text>
                  </View>
                  <ProgressBar value={c.percentage} />
                </View>
              ))}
              <T v="caption">D’après {plural(data.totalInteractions, 'geste', 'gestes')} : sorties gardées, « j’y vais » et swipes.</T>
            </Card>
          ) : (
            <Card>
              <T v="small">Garde des sorties, dis « j’y vais » ou joue à Match : tes catégories préférées apparaîtront ici.</T>
              <Button label="Jouer à Match" kind="secondary" compact onPress={() => router.push('/match')} style={{ marginTop: 12, alignSelf: 'flex-start' }} />
            </Card>
          )}
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  block: { marginTop: 28 },
  hero: { backgroundColor: colors.night, borderRadius: radius.xl, padding: 20 },
  heroEmoji: { fontSize: 44 },
  heroTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 34, letterSpacing: -0.6, color: colors.paper, marginTop: 2 },
  heroTagline: { fontFamily: fonts.semibold, fontSize: 16, color: colors.accentGlow, marginTop: 6 },
  heroText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: 'rgba(251,250,247,0.85)', marginTop: 10 },
  xp: { fontFamily: fonts.display, fontSize: 28, color: colors.ink },
  catLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  catName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  catPct: { fontFamily: fonts.medium, fontSize: 14, color: colors.textSecondary },
})
