import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { Bookmark } from 'lucide-react-native'
import type { CardEvent } from '@/shared'
import { useSavedIds, useToggleSave } from '@/lib/queries'
import { colors } from '@/theme'

/** Garder une sortie : sur le téléphone sans compte, dans le compte sinon. */
export function SaveButton({ event, onDark, size = 20, style }: { event: CardEvent; onDark?: boolean; size?: number; style?: StyleProp<ViewStyle> }) {
  const saved = useSavedIds().has(event.id)
  const toggle = useToggleSave()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={saved ? `Ne plus garder ${event.title}` : `Garder ${event.title}`}
      accessibilityState={{ selected: saved }}
      hitSlop={10}
      onPress={() => toggle.mutate({ event, saved: !saved })}
      style={({ pressed }) => [styles.btn, onDark ? styles.dark : styles.light, style, { opacity: pressed ? 0.7 : 1 }]}>
      <Bookmark size={size} color={saved ? colors.accent : onDark ? colors.paper : colors.ink} fill={saved ? colors.accent : 'transparent'} strokeWidth={2} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  light: { backgroundColor: 'rgba(254,253,252,0.92)' },
  dark: { backgroundColor: 'rgba(19,16,39,0.55)' },
})
