import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { BellRing, Check } from 'lucide-react-native'
import { useArtistFollow, useFollowArtist } from '@/lib/queries'
import { useSession } from '@/lib/auth'
import { enablePush, pushStatus } from '@/lib/push'
import { getLocalState } from '@/lib/local-store'
import { colors, fonts, radius } from '@/theme'

/** Après un premier suivi, on propose les notifications une seule fois. */
async function maybeAskPush() {
  if (getLocalState().pushAsked) return
  if ((await pushStatus()) !== 'undetermined') return
  Alert.alert('Être prévenu sur ton téléphone ?', 'Nouvelle date à Paris, ouverture de la billetterie, rappel la veille : une notification, sans e-mail à surveiller.', [
    { text: 'Plus tard', style: 'cancel' },
    { text: 'Oui, me prévenir', onPress: () => enablePush().catch(() => {}) },
  ])
}

/** « Suivre » un artiste : alertes nouvelle date, billetterie, veille du concert. */
export function ArtistFollowButton({ artistKey, name }: { artistKey: string; name: string }) {
  const session = useSession()
  const state = useArtistFollow(session ? artistKey : undefined)
  const follow = useFollowArtist()
  const following = !!state.data?.following
  const onPress = () => {
    if (!session) {
      router.push({ pathname: '/connexion', params: { raison: 'alertes' } })
      return
    }
    follow.mutate(
      { term: artistKey, label: name, follow: !following, id: state.data?.id },
      { onSuccess: () => !following && maybeAskPush() }
    )
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: following, busy: follow.isPending }}
      accessibilityLabel={following ? `Ne plus suivre ${name}` : `Suivre ${name} et recevoir ses alertes`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, following && styles.rowOn, { opacity: pressed ? 0.85 : 1 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.hint}>{following ? 'Tu reçois ses alertes' : 'Nouvelle date, billetterie, rappel'}</Text>
      </View>
      <View style={[styles.pill, following && styles.pillOn]}>
        {following ? <Check size={15} color={colors.paper} /> : <BellRing size={15} color={colors.accent} />}
        <Text style={[styles.pillText, following && { color: colors.paper }]}>{following ? 'Suivi' : 'Suivre'}</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  rowOn: { borderColor: colors.accentGlow, backgroundColor: colors.accentSoft },
  name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 34, borderRadius: radius.full, borderWidth: 1, borderColor: colors.accent },
  pillOn: { backgroundColor: colors.accent },
  pillText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accent },
})
