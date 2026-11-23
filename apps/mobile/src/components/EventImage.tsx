import { useState } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { CATEGORY_BY_SLUG, hdImageUrl } from '@/shared'
import { colors, fonts } from '@/theme'

/**
 * Photo de la sortie (grande variante quand la source en a une), ou une affiche
 * typographique quand la source n'en a pas ou qu'elle ne se charge pas :
 * jamais d'image cassée, jamais d'initiales.
 */
export function EventImage({
  uri,
  categorySlug,
  title,
  style,
  priority,
  label,
  compact,
}: {
  uri: string | null
  categorySlug?: string | null
  /** Titre affiché sur l'affiche de repli. */
  title?: string | null
  style?: StyleProp<ViewStyle>
  priority?: boolean
  /** Description pour VoiceOver ; vide quand le titre est déjà lu à côté. */
  label?: string
  /** Vignette : affiche réduite à la catégorie. */
  compact?: boolean
}) {
  const src = hdImageUrl(uri)
  const [failed, setFailed] = useState<string | null>(null)
  if (!src || failed === src) {
    const cat = categorySlug ? CATEGORY_BY_SLUG[categorySlug] : null
    return (
      <View style={[styles.poster, style]} accessible={!!label} accessibilityLabel={label} importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}>
        <LinearGradient colors={[colors.posterFrom, colors.posterTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Text style={styles.posterKicker} numberOfLines={1}>
          {cat?.name ?? 'Paris'}
        </Text>
        {!compact && title ? (
          <Text style={styles.posterTitle} numberOfLines={4} adjustsFontSizeToFit minimumFontScale={0.5}>
            {title}
          </Text>
        ) : null}
      </View>
    )
  }
  return (
    <Image
      source={{ uri: src }}
      style={[styles.fill, style as object]}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      priority={priority ? 'high' : 'normal'}
      recyclingKey={src}
      onError={() => setFailed(src)}
      accessible={!!label}
      accessibilityLabel={label}
    />
  )
}

const styles = StyleSheet.create({
  fill: { backgroundColor: colors.surface2 },
  poster: { backgroundColor: colors.surface2, justifyContent: 'flex-end', padding: 12, overflow: 'hidden' },
  posterKicker: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.accent },
  posterTitle: { fontFamily: fonts.display, fontSize: 30, lineHeight: 31, color: colors.text, marginTop: 6 },
})
