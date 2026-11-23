import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { ChevronRight, X } from 'lucide-react-native'
import { EventCard } from '@/components/EventCard'
import { T } from '@/components/ui'
import { useEventList } from '@/lib/queries'
import { errorMessage } from '@/lib/api'
import { colors, fonts, GUTTER } from '@/theme'

export interface SelectedVenue {
  slug: string
  name: string
  arr: string | null
  n: number
}

/** Panneau bas : les sorties du lieu touché sur la carte. */
export function VenuePanel({ venue, params, bottomInset, onClose }: { venue: SelectedVenue; params: string; bottomInset: number; onClose: () => void }) {
  const [slide] = useState(() => new Animated.Value(0))
  useEffect(() => {
    slide.setValue(0)
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 180 }).start()
  }, [venue.slug, slide])

  const listParams = useMemo(() => `venue=${encodeURIComponent(venue.slug)}${params ? `&${params}` : ''}`, [venue.slug, params])
  const q = useEventList(listParams, 10)
  const events = q.data?.pages[0]?.events ?? []
  const total = q.data?.pages[0]?.total ?? venue.n

  return (
    <Animated.View
      style={[
        styles.panel,
        { paddingBottom: bottomInset + 12 },
        { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) }] },
      ]}
      accessibilityViewIsModal={false}>
      <View style={styles.handle} />
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <T v="title3" accessibilityRole="header" numberOfLines={1}>
            {venue.name}
          </T>
          <T v="small">
            {[venue.arr, `${total} sortie${total > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
          </T>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer" hitSlop={12} onPress={onClose} style={styles.close}>
          <X size={20} color={colors.text} />
        </Pressable>
      </View>
      <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ paddingHorizontal: GUTTER }}>
        {q.isPending ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} /> : null}
        {q.isError ? <T v="small" style={{ marginVertical: 16 }}>{errorMessage(q.error)}</T> : null}
        {q.isSuccess && !events.length ? (
          <T v="small" style={{ marginVertical: 16 }}>
            Plus rien à venir ici pour ce moment-là. Change de créneau en haut de la carte.
          </T>
        ) : null}
        {events.map((e, i) => (
          <View key={e.id} style={i > 0 ? styles.sep : undefined}>
            <EventCard event={e} variant="row" origin="carte" />
          </View>
        ))}
      </ScrollView>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push({ pathname: '/lieux/[slug]', params: { slug: venue.slug } })}
        style={({ pressed }) => [styles.link, { opacity: pressed ? 0.7 : 1 }]}>
        <Text style={styles.linkText}>Voir le lieu</Text>
        <ChevronRight size={16} color={colors.accent} />
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line2, marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: GUTTER, paddingBottom: 6, gap: 8 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44 },
  linkText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accent },
})
