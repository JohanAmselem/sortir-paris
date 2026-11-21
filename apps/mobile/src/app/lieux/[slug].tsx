import { useEffect } from 'react'
import { FlatList, Pressable, StyleSheet, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BellRing, Check, Globe, Navigation, Share2 } from 'lucide-react-native'
import { useFollowVenue, useVenue, useVenueFollow } from '@/lib/queries'
import { useSession } from '@/lib/auth'
import { errorMessage, RedirectSignal } from '@/lib/api'
import { openDirections, openWeb, shareLink } from '@/lib/actions'
import { safeUrl } from '@/shared'
import { EventCard } from '@/components/EventCard'
import { Button, EmptyState, ErrorState, Loading, T } from '@/components/ui'
import { colors, GUTTER } from '@/theme'

/** Fiche lieu : adresse, gestes (itinéraire, site, suivre) et prochaines sorties. */
export default function VenueScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const insets = useSafeAreaInsets()
  const session = useSession()
  const q = useVenue(slug)
  const v = q.data?.venue
  const follow = useVenueFollow(v?.id)
  const toggle = useFollowVenue()

  useEffect(() => {
    if (q.error instanceof RedirectSignal) router.replace({ pathname: '/lieux/[slug]', params: { slug: q.error.to } })
  }, [q.error])

  if (!v) {
    return q.isLoading || q.error instanceof RedirectSignal ? <Loading /> : <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
  }
  const following = !!follow.data?.following
  const website = safeUrl(v.website)
  const onFollow = () => {
    if (!session) return router.push({ pathname: '/connexion', params: { raison: 'suivre' } })
    toggle.mutate({ venueId: v.id, follow: !following })
  }

  const header = (
    <View style={{ paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: 12 }}>
      <T v="kicker">Lieu{v.arrondissement ? ` · ${v.arrondissement}` : ''}</T>
      <T v="h1" accessibilityRole="header" style={{ marginTop: 4 }}>
        {v.name}
      </T>
      <T v="small" style={{ marginTop: 6 }}>
        {[v.address, [v.zipCode, v.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
      </T>
      <View style={styles.buttons}>
        <Button
          label={following ? 'Suivi' : 'Suivre ce lieu'}
          kind={following ? 'accent' : 'secondary'}
          compact
          icon={following ? <Check size={16} color={colors.white} /> : <BellRing size={16} color={colors.ink} />}
          loading={toggle.isPending}
          onPress={onFollow}
          accessibilityHint="Tu verras ses nouvelles dates dans « Moi »"
        />
        <Button
          label="Itinéraire"
          kind="secondary"
          compact
          icon={<Navigation size={16} color={colors.ink} />}
          onPress={() => openDirections({ lat: v.lat, lng: v.lng, name: v.name, address: v.address })}
        />
        {website ? <Button label="Site" kind="secondary" compact icon={<Globe size={16} color={colors.ink} />} onPress={() => openWeb(website)} /> : null}
      </View>
      <T v="h2" style={{ marginTop: 24 }}>
        {q.data!.total > 0 ? `Prochaines sorties (${q.data!.total})` : 'Prochaines sorties'}
      </T>
    </View>
  )

  return (
    <>
      <Stack.Screen
        options={{
          title: v.name,
          headerRight: () => (
            <Pressable onPress={() => shareLink(v.name, q.data!.webUrl)} accessibilityLabel="Partager" hitSlop={10}>
              <Share2 size={20} color={colors.ink} />
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={q.data!.events}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: GUTTER }}>
            <EventCard event={item} variant="row" origin="lieu" />
          </View>
        )}
        ListEmptyComponent={<EmptyState title="Rien de programmé pour l’instant" text="Suis ce lieu : ses prochaines dates apparaîtront dans « Moi »." />}
        style={{ backgroundColor: colors.paper }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
})
