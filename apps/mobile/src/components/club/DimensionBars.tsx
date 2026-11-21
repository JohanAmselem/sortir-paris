/** Les 8 dimensions du profil culturel, de « bas » à « haut » (comme sur le site). */
import { StyleSheet, Text, View } from 'react-native'
import { DIMENSIONS, DIMENSION_LABELS } from '@/shared'
import { colors, fonts } from '@/theme'

export function DimensionBars({ scores, dark }: { scores: Record<string, number>; dark?: boolean }) {
  const fg = dark ? colors.paper : colors.ink
  const muted = dark ? 'rgba(251,250,247,0.7)' : colors.textSecondary
  return (
    <View style={{ gap: 14 }}>
      {DIMENSIONS.map((d) => {
        const meta = DIMENSION_LABELS[d]
        const value = Math.max(0, Math.min(100, Math.round(scores[d] ?? 50)))
        return (
          <View
            key={d}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`${meta.label} : ${value} sur 100, de ${meta.low} à ${meta.high}`}
            accessibilityValue={{ min: 0, max: 100, now: value }}>
            <Text style={[styles.label, { color: fg }]}>{meta.label}</Text>
            <View style={[styles.track, { backgroundColor: dark ? 'rgba(255,255,255,0.14)' : colors.paperDeep }]}>
              <View style={[styles.dot, { left: `${value}%` }]} />
              <View style={[styles.fill, { width: `${value}%` }]} />
            </View>
            <View style={styles.ends}>
              <Text style={[styles.end, { color: muted }, value < 50 && { color: fg, fontFamily: fonts.semibold }]}>{meta.low}</Text>
              <Text style={[styles.end, { color: muted }, value >= 50 && { color: fg, fontFamily: fonts.semibold }]}>{meta.high}</Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.semibold, fontSize: 14, marginBottom: 6 },
  track: { height: 8, borderRadius: 4, justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: colors.accent, opacity: 0.35 },
  dot: { position: 'absolute', width: 16, height: 16, marginLeft: -8, borderRadius: 8, backgroundColor: colors.accent, zIndex: 1 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  end: { fontFamily: fonts.regular, fontSize: 13 },
})
