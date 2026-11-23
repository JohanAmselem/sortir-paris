/**
 * Onglet « Sortir » (accueil 2.0, maquette du 23/11/2026) : 6 blocs au lieu de 11.
 *   En-tête (ce soir à Paris, une recherche, 5 pastilles) · Notre choix ·
 *   Par envie · Ce week-end · Les grosses dates · Expos du moment · Alertes concerts.
 */
import { useState } from 'react'
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Bell, CalendarDays, LocateFixed, UserRound } from 'lucide-react-native'
import type { CardEvent, EnvieTile, HomeWhen } from '@/shared'
import { hdImageUrl } from '@/shared'
import { useHomeV2 } from '@/lib/queries'
import { useSession } from '@/lib/auth'
import { locate, locateMessage, type Coords } from '@/lib/location'
import { errorMessage } from '@/lib/api'
import { showToast } from '@/lib/toast'
import { EventCard } from '@/components/EventCard'
import { Button, Chip, ErrorState, IconButton, Notice, RowSkeleton, SearchButton, SectionHeader, T } from '@/components/ui'
import { colors, fonts, GUTTER, radius } from '@/theme'
import { StatusBarBackdrop } from '@/components/StatusBarBackdrop'

const WHENS: Array<{ key: HomeWhen; label: string; title: string }> = [
  { key: 'tonight', label: 'Ce soir', title: 'Ce soir\nà Paris' },
  { key: 'tomorrow', label: 'Demain', title: 'Demain\nà Paris' },
  { key: 'weekend', label: 'Ce week-end', title: 'Ce week-end\nà Paris' },
]

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' })

/** Ouvre l'Agenda avec des filtres (même schéma que les URL du site). */
export function openAgenda(params = '', focus = false) {
  router.navigate({ pathname: '/agenda', params: { p: params, ...(focus ? { focus: '1' } : {}) } })
}

function Rail({ data, render, gap = 12 }: { data: CardEvent[]; render: (e: CardEvent) => React.ReactElement; gap?: number }) {
  return (
    <FlatList
      horizontal
      data={data}
      keyExtractor={(e) => e.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: GUTTER, gap }}
      renderItem={({ item }) => render(item)}
      initialNumToRender={3}
    />
  )
}

function Tile({ tile }: { tile: EnvieTile }) {
  const src = hdImageUrl(tile.imageUrl)
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={tile.label} onPress={() => openAgenda(tile.params)} style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.85 : 1 }]}>
      {src ? <Image source={{ uri: src }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : null}
      <LinearGradient colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.7)']} style={StyleSheet.absoluteFill} />
      <Text style={styles.tileLabel} numberOfLines={2}>
        {tile.label}
      </Text>
    </Pressable>
  )
}

export default function Sortir() {
  const [when, setWhen] = useState<HomeWhen>('tonight')
  const [coords, setCoords] = useState<Coords | null>(null)
  const [locating, setLocating] = useState(false)
  const session = useSession()
  const home = useHomeV2(when, coords)
  const data = home.data
  const current = WHENS.find((w) => w.key === when)!

  const toggleNear = async () => {
    if (coords) return setCoords(null)
    setLocating(true)
    const r = await locate()
    setLocating(false)
    if (r.ok) setCoords(r.coords)
    else showToast(locateMessage(r.reason))
  }

  const count = data && data.when === when ? data.count : null
  const today = DATE_FMT.format(new Date())

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl tintColor={colors.muted} refreshing={home.isRefetching && !home.isPlaceholderData} onRefresh={() => void home.refetch()} />}>
        <View style={styles.topbar}>
          <Text style={styles.logo} accessibilityRole="header" accessibilityLabel="Paname Club">
            PANAME<Text style={styles.logoClub}>CLUB</Text>
          </Text>
          <IconButton label={session ? 'Mon compte et mes réglages' : 'Se connecter, réglages'} onPress={() => router.push('/reglages')}>
            <UserRound size={19} color={colors.text2} />
          </IconButton>
        </View>

        <View style={{ paddingHorizontal: GUTTER, marginTop: 14 }}>
          <T v="display" accessibilityRole="header">
            {coords ? current.title.replace('à Paris', 'près de toi') : current.title}
          </T>
          <T v="small" style={{ marginTop: 8 }}>
            {when === 'tonight' ? today.charAt(0).toUpperCase() + today.slice(1) : current.label}
            {count != null ? ` · ${count.toLocaleString('fr-FR')} sortie${count > 1 ? 's' : ''}` : ''}
          </T>
          <SearchButton onPress={() => openAgenda('', true)} style={{ marginTop: 16 }} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
          {WHENS.map((w) => (
            <Chip key={w.key} label={w.label} active={when === w.key} onPress={() => setWhen(w.key)} />
          ))}
          <Chip label="Plus tard" icon={<CalendarDays size={16} color={colors.text} />} onPress={() => openAgenda()} />
          <Chip
            label={locating ? 'Position…' : 'Près de moi'}
            active={!!coords}
            icon={<LocateFixed size={16} color={coords ? colors.bg : colors.text} />}
            onPress={() => void toggleNear()}
          />
        </ScrollView>

        {home.isError && data ? <View style={{ marginTop: 16 }}><Notice text="Hors connexion : les idées telles que chargées la dernière fois." tone="warning" /></View> : null}

        {!data ? (
          home.isError ? (
            <View style={{ height: 320 }}>
              <ErrorState message={errorMessage(home.error)} onRetry={() => void home.refetch()} />
            </View>
          ) : (
            <View style={{ marginTop: 24 }}>
              <RowSkeleton count={5} />
            </View>
          )
        ) : (
          <>
            <View style={styles.section}>
              <SectionHeader title="Notre choix" onMore={() => openAgenda(`when=${when}`)} moreLabel={when === 'tonight' ? 'Tout ce soir' : 'Tout voir'} />
              {data.picks.length ? (
                <Rail data={data.picks} gap={14} render={(e) => <EventCard event={e} variant="poster" origin="choix" />} />
              ) : (
                <T v="small" style={{ paddingHorizontal: GUTTER }}>
                  {coords ? 'Rien d’assez proche pour l’instant : élargis à tout Paris.' : 'Rien de prévu pour l’instant.'}
                </T>
              )}
            </View>

            <View style={styles.section}>
              <SectionHeader title="Par envie" />
              <View style={styles.tiles}>
                {data.envies.map((t) => (
                  <Tile key={t.slug} tile={t} />
                ))}
              </View>
            </View>

            {data.weekend.length ? (
              <View style={styles.section}>
                <SectionHeader title="Ce week-end" onMore={() => openAgenda('when=weekend')} moreLabel="Tout le week-end" />
                <Rail data={data.weekend} render={(e) => <EventCard event={e} variant="card" origin="week-end" />} />
              </View>
            ) : null}

            {data.bigDates.length ? (
              <View style={styles.section}>
                <SectionHeader title="Les grosses dates" subtitle="Les grandes salles, des mois à l’avance" onMore={() => openAgenda('cat=concerts')} moreLabel="Agenda" />
                <Rail data={data.bigDates} render={(e) => <EventCard event={e} variant="big" origin="grosses-dates" />} />
              </View>
            ) : null}

            {data.expos.length ? (
              <View style={styles.section}>
                <SectionHeader title="Expos du moment" onMore={() => openAgenda('cat=expos')} moreLabel="Toutes" />
                <View style={{ paddingHorizontal: GUTTER }}>
                  {data.expos.slice(0, 4).map((e) => (
                    <EventCard key={e.id} event={e} variant="row" origin="expos" />
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.alertCard}>
              <View style={styles.alertKicker}>
                <Bell size={15} color={colors.accent} />
                <T v="micro">Alertes concerts</T>
              </View>
              <T v="title2" style={{ marginTop: 8 }}>
                Ne rate plus tes artistes
              </T>
              <T v="small" style={{ marginTop: 6, color: colors.text2 }}>
                Une notification dès qu’ils annoncent une date à Paris, puis la veille du concert.
              </T>
              <Button
                label="Choisir mes artistes"
                kind="light"
                compact
                style={{ alignSelf: 'flex-start', marginTop: 14 }}
                onPress={() => (session ? router.push('/compte/artistes') : router.push({ pathname: '/connexion', params: { raison: 'alertes' } }))}
              />
            </View>
          </>
        )}
      </ScrollView>
      <StatusBarBackdrop color={colors.bg} />
    </View>
  )
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, paddingTop: 4 },
  logo: { fontFamily: fonts.extrabold, fontSize: 15, letterSpacing: 2.2, color: colors.text },
  logoClub: { fontFamily: fonts.regular, color: colors.accent },
  pills: { paddingHorizontal: GUTTER, gap: 8, paddingTop: 14 },
  section: { marginTop: 32 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: GUTTER },
  tile: { width: '31.9%', height: 92, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface2, justifyContent: 'flex-end', padding: 10 },
  tileLabel: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 17, color: colors.white },
  alertCard: { marginTop: 32, marginHorizontal: GUTTER, padding: 18, borderRadius: radius.xl, backgroundColor: colors.plum, borderWidth: 1, borderColor: colors.accentLine },
  alertKicker: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
