/**
 * Mes artistes et lieux : chercher un artiste à suivre, voir ses prochaines
 * dates à Paris, ne plus suivre. Les alertes partent par notification et/ou e-mail.
 */
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BellRing, ChevronDown, ChevronUp, MapPin, Search, X } from 'lucide-react-native'
import { formatShortDay, formatTime } from '@/shared'
import { useSession } from '@/lib/auth'
import { useArtistDates, useArtistSuggest, useFollowArtist, useMe, useUnfollow } from '@/lib/queries'
import { pushStatus, enablePush, type PushStatus } from '@/lib/push'
import { Button, Card, EmptyState, Loading, T } from '@/components/ui'
import { colors, fonts, GUTTER, radius } from '@/theme'

function ArtistDates({ artistKey }: { artistKey: string }) {
  const q = useArtistDates(artistKey)
  if (q.isLoading) return <T v="caption" style={{ paddingVertical: 6 }}>Chargement des dates…</T>
  const dates = q.data?.dates ?? []
  if (!dates.length) return <T v="caption" style={{ paddingVertical: 6 }}>Pas de date à Paris pour l’instant : on te prévient dès qu’il y en a une.</T>
  return (
    <View style={{ paddingTop: 4 }}>
      {dates.map((d) => (
        <Pressable key={d.slug} accessibilityRole="link" onPress={() => router.push({ pathname: '/evenements/[slug]', params: { slug: d.slug } })} style={styles.dateRow}>
          <Text style={styles.dateDay}>
            {formatShortDay(new Date(d.startDate))}
            {d.timeKnown ? ` · ${formatTime(new Date(d.startDate))}` : ''}
          </Text>
          <Text style={styles.dateVenue} numberOfLines={1}>
            {d.venueName ?? d.title}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

export default function MesArtistes() {
  const insets = useSafeAreaInsets()
  const session = useSession()
  const me = useMe()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [push, setPush] = useState<PushStatus | null>(null)
  const suggest = useArtistSuggest(debounced)
  const follow = useFollowArtist()
  const unfollow = useUnfollow()

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => {
    pushStatus().then(setPush)
  }, [])

  if (!session) {
    return (
      <EmptyState
        title="Tes artistes, tes alertes"
        text="Connecte-toi pour suivre des artistes et des lieux : on te prévient de leurs dates à Paris."
        action={<Button label="Me connecter" onPress={() => router.push({ pathname: '/connexion', params: { raison: 'alertes' } })} />}
      />
    )
  }
  if (!me.data) return <Loading />

  const follows = me.data.follows
  const followedKeys = new Set(follows.filter((f) => f.kind === 'artist').map((f) => f.term))
  const artists = follows.filter((f) => f.kind === 'artist')
  const venues = follows.filter((f) => f.kind === 'venue')

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={{ padding: GUTTER, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
      {push === 'undetermined' ? (
        <Card style={{ marginBottom: 16, backgroundColor: colors.accentSoft, borderColor: colors.accentGlow }}>
          <T v="bodyStrong">Être prévenu sur ce téléphone</T>
          <T v="small" style={{ marginTop: 4 }}>
            Nouvelle date, billetterie qui ouvre, rappel la veille.
          </T>
          <Button label="Activer les notifications" compact kind="accent" style={{ marginTop: 10, alignSelf: 'flex-start' }} onPress={() => enablePush().then(setPush)} />
        </Card>
      ) : null}

      <T v="h2">Suivre un artiste</T>
      <View style={styles.search}>
        <Search size={18} color={colors.textMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Un artiste, un groupe…"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Chercher un artiste"
        />
        {q ? (
          <Pressable onPress={() => setQ('')} accessibilityLabel="Effacer" hitSlop={8}>
            <X size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {debounced.length >= 2 ? (
        <View style={{ marginTop: 6 }}>
          {(suggest.data?.artists ?? []).map((a) => {
            const on = followedKeys.has(a.key)
            return (
              <Pressable
                key={a.key}
                accessibilityRole="button"
                accessibilityLabel={on ? `${a.name}, déjà suivi` : `Suivre ${a.name}`}
                disabled={on || follow.isPending}
                onPress={() => follow.mutate({ term: a.key, label: a.name, follow: true }, { onSuccess: () => setQ('') })}
                style={styles.suggestRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{a.name}</Text>
                  <Text style={styles.hint}>
                    {a.dates} date{a.dates > 1 ? 's' : ''} à Paris
                  </Text>
                </View>
                <Text style={[styles.action, on && { color: colors.textMuted }]}>{on ? 'Suivi' : 'Suivre'}</Text>
              </Pressable>
            )
          })}
          {suggest.data && !suggest.data.artists.length ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => follow.mutate({ term: debounced, label: debounced, follow: true }, { onSuccess: () => setQ('') })}
              style={styles.suggestRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>Suivre « {debounced} »</Text>
                <Text style={styles.hint}>Pas de date en ce moment : on te prévient à la prochaine.</Text>
              </View>
              <BellRing size={18} color={colors.accent} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <T v="h2" style={{ marginTop: 28 }}>
        Mes artistes ({artists.length})
      </T>
      {artists.length ? (
        artists.map((f) => (
          <View key={f.id} style={styles.item}>
            <Pressable accessibilityRole="button" onPress={() => setOpen((o) => (o === f.id ? null : f.id))} style={styles.itemHead}>
              <Text style={[styles.name, { flex: 1 }]}>{f.label}</Text>
              {open === f.id ? <ChevronUp size={18} color={colors.textMuted} /> : <ChevronDown size={18} color={colors.textMuted} />}
            </Pressable>
            {open === f.id ? (
              <>
                <ArtistDates artistKey={f.term ?? ''} />
                <Button label="Ne plus suivre" kind="ghost" compact onPress={() => unfollow.mutate(f.id)} style={{ alignSelf: 'flex-start' }} />
              </>
            ) : null}
          </View>
        ))
      ) : (
        <T v="small" style={{ marginTop: 6 }}>
          Aucun artiste suivi. Cherche-en un ci-dessus, ou touche « Suivre » sur la fiche d’un concert.
        </T>
      )}

      <T v="h2" style={{ marginTop: 28 }}>
        Mes lieux ({venues.length})
      </T>
      {venues.length ? (
        venues.map((f) => (
          <View key={f.id} style={[styles.item, styles.itemHead]}>
            <MapPin size={16} color={colors.accent} />
            <Pressable style={{ flex: 1 }} accessibilityRole="link" onPress={() => f.venueSlug && router.push({ pathname: '/lieux/[slug]', params: { slug: f.venueSlug } })}>
              <Text style={styles.name}>{f.label}</Text>
            </Pressable>
            <Pressable onPress={() => unfollow.mutate(f.id)} accessibilityLabel={`Ne plus suivre ${f.label}`} hitSlop={8}>
              <X size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        ))
      ) : (
        <T v="small" style={{ marginTop: 6 }}>
          Suis un lieu depuis sa fiche pour voir ses nouvelles dates.
        </T>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 12,
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingVertical: 10 },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  action: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accent },
  item: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateRow: { paddingVertical: 8 },
  dateDay: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  dateVenue: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
})
