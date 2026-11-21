import { useState } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { Image } from 'expo-image'
import { CATEGORY_BY_SLUG } from '@/shared'
import { colors, fonts } from '@/theme'

/**
 * Photo de la sortie, ou une affiche typographique (comme sur le site) quand la
 * source n'en a pas ou qu'elle ne se charge pas : jamais d'image cassée.
 */
export function EventImage({
  uri,
  categorySlug,
  style,
  priority,
  label,
}: {
  uri: string | null
  categorySlug?: string | null
  style?: StyleProp<ViewStyle>
  priority?: boolean
  /** Description pour VoiceOver ; vide quand le titre est déjà lu à côté. */
  label?: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  if (!uri || failed === uri) {
    const cat = categorySlug ? CATEGORY_BY_SLUG[categorySlug] : null
    return (
      <View style={[styles.poster, style]} accessible={!!label} accessibilityLabel={label} importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}>
        <Text style={styles.posterText} numberOfLines={2}>
          {cat?.plural ?? 'Paris'}
        </Text>
      </View>
    )
  }
  return (
    <Image
      source={{ uri }}
      style={[styles.fill, style as object]}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      priority={priority ? 'high' : 'normal'}
      recyclingKey={uri}
      onError={() => setFailed(uri)}
      accessible={!!label}
      accessibilityLabel={label}
    />
  )
}

const styles = StyleSheet.create({
  fill: { backgroundColor: colors.paperDeep },
  poster: { backgroundColor: colors.night, justifyContent: 'flex-end', padding: 12, overflow: 'hidden' },
  posterText: { fontFamily: fonts.display, fontSize: 30, lineHeight: 30, textTransform: 'uppercase', color: 'rgba(251,250,247,0.35)' },
})
