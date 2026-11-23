import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { Bookmark } from 'lucide-react-native'
import type { CardEvent } from '@/shared'
import { useSavedIds, useToggleSave } from '@/lib/queries'
import { colors, HIT } from '@/theme'

/** Garder une sortie : sur le téléphone sans compte, dans le compte sinon. */
export function SaveButton({
  event,
  onImage,
  onDark,
  size = 20,
  style,
  small,
}: {
  event: CardEvent
  /** Posé sur une photo : fond voilé. */
  onImage?: boolean
  /** Ancien nom de `onImage`. */
  onDark?: boolean
  size?: number
  style?: StyleProp<ViewStyle>
  /** 36 pt visuels (cible élargie à 44 pt). */
  small?: boolean
}) {
  const saved = useSavedIds().has(event.id)
  const toggle = useToggleSave()
  const dim = small ? 36 : HIT
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={saved ? `Ne plus garder ${event.title}` : `Garder ${event.title}`}
      accessibilityState={{ selected: saved }}
      hitSlop={small ? 6 : 2}
      onPress={() => toggle.mutate({ event, saved: !saved })}
      style={({ pressed }) => [
        styles.btn,
        { width: dim, height: dim, borderRadius: dim / 2 },
        onImage || onDark ? styles.onImage : styles.plain,
        style,
        { opacity: pressed ? 0.7 : 1 },
      ]}>
      <Bookmark size={size} color={saved ? colors.accent : colors.text} fill={saved ? colors.accent : 'transparent'} strokeWidth={2} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center' },
  plain: { backgroundColor: colors.surface2 },
  onImage: { backgroundColor: colors.scrim },
})
