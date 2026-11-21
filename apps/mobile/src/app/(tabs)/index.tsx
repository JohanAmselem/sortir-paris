/**
 * Onglet « Ce soir » : l'accueil du site en appli. « Je veux sortir… », le choix
 * de ce soir, le week-end jour par jour, les grandes scènes, les expos, la
 * dernière chance, le gratuit, et l'entrée du Club.
 */
import { useCallback, useState } from 'react'
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useStatusBar } from '@/lib/status-bar'
import { ArrowRight, Flame, Gift } from 'lucide-react-native'
import type { CardEvent, HomeSection } from '@/shared'
import { useHome } from '@/lib/queries'
import { errorMessage } from '@/lib/api'
import { Discover } from '@/components/home/Discover'
import { WeekendProgram } from '@/components/home/WeekendProgram'
import { EventCard } from '@/components/EventCard'
import { ErrorState, Loading, Notice, SectionHeader, T } from '@/components/ui'
import { colors, GUTTER, radius } from '@/theme'
import { StatusBarBackdrop } from '@/components/StatusBarBackdrop'

function Rail({ events, variant, origin }: { events: CardEvent[]; variant: 'poster' | 'tile'; origin: string }) {
  return (
    <FlatList
      horizontal
      data={events}
      keyExtractor={(e) => e.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}
      renderItem={({ item }) => <EventCard event={item} variant={variant} origin={origin} />}
    />
  )
}

function Section({ section }: { section: HomeSection }) {
  const more = section.moreParams
    ? () => router.push({ pathname: '/liste', params: { params: section.moreParams!, title: section.title, kicker: section.kicker } })
    : undefined
  return (
    <View style={styles.section}>
      <SectionHeader kicker={section.kicker} title={section.title} onMore={more} />
      {section.layout === 'list' ? (
        <View style={{ paddingHorizontal: GUTTER }}>
          {section.events.slice(0, 6).map((e) => (
            <EventCard key={e.id} event={e} variant="row" origin={section.id} />
          ))}
        </View>
      ) : (
        <Rail events={section.events} variant={section.layout === 'posters' ? 'tile' : 'poster'} origin={section.id} />
      )}
    </View>
  )
}

function ClubTeaser() {
  return (
    <View style={[styles.section, { paddingHorizontal: GUTTER, gap: 10 }]}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/drop')} style={({ pressed }) => [styles.teaser, { opacity: pressed ? 0.9 : 1 }]}>
        <Gift size={22} color={colors.accentGlow} />
        <View style={{ flex: 1 }}>
          <T v="bodyStrong" style={{ color: colors.paper }}>
            Le Drop du lundi
          </T>
          <T v="small" style={{ color: 'rgba(251,250,247,0.75)' }}>
            5 idées choisies pour ta semaine.
          </T>
        </View>
        <ArrowRight size={18} color={colors.paper} />
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push('/match')} style={({ pressed }) => [styles.teaserLight, { opacity: pressed ? 0.9 : 1 }]}>
        <Flame size={22} color={colors.neon} />
        <View style={{ flex: 1 }}>
          <T v="bodyStrong">Match</T>
          <T v="small">Swipe les sorties, on apprend tes goûts.</T>
        </View>
        <ArrowRight size={18} color={colors.ink} />
      </Pressable>
    </View>
  )
}

export default function CeSoir() {
  useStatusBar('light')
  const insets = useSafeAreaInsets()
  const home = useHome()
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await home.refetch().catch(() => {})
    setRefreshing(false)
  }, [home])

  const data = home.data
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.paper} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View style={{ backgroundColor: colors.night, paddingTop: insets.top + 6 }}>
          <View style={styles.brand}>
            <Image source={require('@/../assets/brand/wordmark-light.png')} style={styles.wordmark} contentFit="contain" accessibilityLabel="Paname Club" />
          </View>
          <Discover initial={data?.discover} />
        </View>

        {home.isError && data ? <View style={{ marginTop: 16 }}><Notice text="Hors connexion : voici les dernières idées chargées." tone="warning" /></View> : null}
        {!data && home.isLoading ? (
          <View style={{ paddingVertical: 60 }}>
            <Loading label="On cherche les meilleures idées…" />
          </View>
        ) : null}
        {!data && home.isError ? <ErrorState message={errorMessage(home.error)} onRetry={() => home.refetch()} /> : null}

        {data ? (
          <>
            {data.picks.length ? (
              <View style={styles.section}>
                <SectionHeader
                  kicker="Notre sélection"
                  title={data.tonightIsLate ? 'Encore possible ce soir' : 'Le choix de ce soir'}
                  onMore={() => router.push({ pathname: '/liste', params: { params: 'when=tonight', title: 'Tout ce soir', kicker: 'Ce soir' } })}
                  moreLabel="Tout ce soir"
                />
                <View style={{ paddingHorizontal: GUTTER }}>
                  <EventCard event={data.picks[0]} variant="feature" rank={1} origin="picks" />
                  {data.picks.slice(1).map((e, i) => (
                    <EventCard key={e.id} event={e} variant="row" rank={i + 2} origin="picks" />
                  ))}
                </View>
              </View>
            ) : null}

            {data.weekend.some((d) => d.events.length) ? (
              <View style={styles.section}>
                <SectionHeader
                  kicker="Le programme"
                  title="Ce week-end"
                  onMore={() => router.push({ pathname: '/liste', params: { params: 'when=weekend', title: 'Ce week-end', kicker: 'Le programme' } })}
                />
                <WeekendProgram days={data.weekend} />
              </View>
            ) : null}

            {data.sections.slice(0, 2).map((s) => (
              <Section key={s.id} section={s} />
            ))}
            <ClubTeaser />
            {data.sections.slice(2).map((s) => (
              <Section key={s.id} section={s} />
            ))}
          </>
        ) : null}
      </ScrollView>
      <StatusBarBackdrop color={colors.night} />
    </View>
  )
}

const styles = StyleSheet.create({
  brand: { paddingHorizontal: GUTTER, paddingBottom: 6 },
  wordmark: { width: 150, height: 16 },
  section: { marginTop: 32 },
  teaser: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.night, borderRadius: radius.lg, padding: 16 },
  teaserLight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
})

