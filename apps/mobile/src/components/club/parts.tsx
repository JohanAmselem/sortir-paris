/** Petites pièces propres au Club : barre de progression, entrée de menu, rail de sorties. */
import type { ReactNode } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import type { CardEvent } from '@/shared'
import { EventCard, type CardVariant } from '@/components/EventCard'
import { colors, fonts, GUTTER, radius } from '@/theme'

export function ProgressBar({ value, max = 100, dark, label }: { value: number; max?: number; dark?: boolean; label?: string }) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0))
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: Math.min(value, max) }}
      style={[styles.track, { backgroundColor: dark ? 'rgba(255,255,255,0.14)' : colors.paperDeep }]}>
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  )
}

export function EntryRow({ icon, title, text, onPress, hint }: { icon: ReactNode; title: string; text: string; onPress: () => void; hint?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${text}`}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [styles.entry, { opacity: pressed ? 0.85 : 1 }]}>
      <View style={styles.entryIcon}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.entryTitle} maxFontSizeMultiplier={1.5}>
          {title}
        </Text>
        <Text style={styles.entryText} maxFontSizeMultiplier={1.5}>
          {text}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
  )
}

/** Rail horizontal de cartes, avec une mention optionnelle sous chaque carte (« 4 membres y vont »). */
export function EventRail({
  events,
  variant = 'poster',
  origin,
  caption,
}: {
  events: CardEvent[]
  variant?: CardVariant
  origin: string
  caption?: (e: CardEvent, i: number) => string | null
}) {
  return (
    <FlatList
      horizontal
      data={events}
      keyExtractor={(e) => e.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}
      renderItem={({ item, index }) => (
        <View>
          <EventCard event={item} variant={variant} origin={origin} />
          {caption ? <Text style={styles.caption}>{caption(item, index)}</Text> : null}
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, overflow: 'hidden', width: '100%' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: colors.accent },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
  },
  entryIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  entryTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  entryText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.textSecondary, marginTop: 2 },
  caption: { fontFamily: fonts.medium, fontSize: 12, color: colors.accent, marginTop: 4 },
})
