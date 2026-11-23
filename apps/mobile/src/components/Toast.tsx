import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useToast } from '@/lib/toast'
import { colors, fonts, radius } from '@/theme'

/** Message bref au-dessus de la barre d'onglets (lib/toast.ts). */
export function Toast() {
  const toast = useToast()
  const insets = useSafeAreaInsets()
  if (!toast) return null
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 72 }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Text style={styles.text}>{toast.text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: colors.text },
  text: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: colors.bg, textAlign: 'center' },
})
