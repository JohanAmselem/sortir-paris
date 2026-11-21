/**
 * Carte de Match : glisser à droite = « ça me tente », à gauche = « pas pour moi ».
 * Geste de react-native-gesture-handler 3 (usePanGesture) animé par Reanimated 4 ;
 * les boutons et VoiceOver déclenchent la même sortie de carte (prop `fling`).
 */
import { useEffect } from 'react'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler'
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { LinearGradient } from 'expo-linear-gradient'
import { formatPrice, formatWhen, type CardEvent } from '@/shared'
import { EventImage } from '@/components/EventImage'
import { venueArea } from '@/components/EventCard'
import { colors, fonts, radius } from '@/theme'
import type { SwipeDirection } from '@/lib/club'

const THRESHOLD = 110
const VELOCITY = 900

export function SwipeCard({
  event,
  onSwiped,
  fling,
  interactive,
}: {
  event: CardEvent
  onSwiped: (direction: SwipeDirection) => void
  /** Demande de sortie par bouton : { direction, nonce } (le nonce change à chaque appui). */
  fling: { direction: SwipeDirection; nonce: number } | null
  interactive: boolean
}) {
  const { width } = useWindowDimensions()
  const reduced = useReducedMotion()
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const out = width * 1.4
  const duration = reduced ? 120 : 240

  const finish = (direction: SwipeDirection) => onSwiped(direction)

  useEffect(() => {
    if (!fling || !interactive) return
    const sign = fling.direction === 'right' ? 1 : -1
    tx.value = withTiming(sign * out, { duration }, (done) => {
      'worklet'
      if (done) scheduleOnRN(finish, fling.direction)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fling?.nonce])

  const pan = usePanGesture({
    enabled: interactive,
    activeOffsetX: [-12, 12],
    onUpdate: (e) => {
      'worklet'
      tx.value = e.translationX
      ty.value = e.translationY * 0.25
    },
    onDeactivate: (e) => {
      'worklet'
      const go = Math.abs(e.translationX) > THRESHOLD || Math.abs(e.velocityX) > VELOCITY
      if (go) {
        const direction: SwipeDirection = e.translationX > 0 ? 'right' : 'left'
        tx.value = withTiming((direction === 'right' ? 1 : -1) * out, { duration }, (done) => {
          'worklet'
          if (done) scheduleOnRN(finish, direction)
        })
      } else {
        tx.value = withSpring(0)
        ty.value = withSpring(0)
      }
    },
  })

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${interpolate(tx.value, [-width, 0, width], [-10, 0, 10], Extrapolation.CLAMP)}deg` },
    ],
  }))
  const likeStyle = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [0, THRESHOLD], [0, 1], Extrapolation.CLAMP) }))
  const passStyle = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [-THRESHOLD, 0], [1, 0], Extrapolation.CLAMP) }))

  const now = new Date()
  const price = formatPrice(event)
  const area = venueArea(event.venue)
  const where = event.venue ? (area ? `${event.venue.name} · ${area}` : event.venue.name) : null
  const when = formatWhen(event, now)

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.card, cardStyle]}
        accessible
        accessibilityLabel={[event.title, when, where, price.tone === 'unknown' ? null : price.label].filter(Boolean).join(', ')}
        accessibilityHint="Glisse à droite si ça te tente, à gauche sinon. Ou utilise les actions."
        accessibilityActions={[
          { name: 'like', label: 'Ça me tente' },
          { name: 'pass', label: 'Pas pour moi' },
        ]}
        onAccessibilityAction={(e) => {
          if (!interactive) return
          if (e.nativeEvent.actionName === 'like') finish('right')
          if (e.nativeEvent.actionName === 'pass') finish('left')
        }}>
        <EventImage uri={event.imageUrl} categorySlug={event.category?.slug} style={StyleSheet.absoluteFill} priority />
        <LinearGradient colors={['transparent', 'rgba(19,16,39,0.55)', colors.night]} locations={[0.35, 0.62, 1]} style={StyleSheet.absoluteFill} />
        <Animated.View style={[styles.stamp, styles.stampLike, likeStyle]} importantForAccessibility="no-hide-descendants">
          <Text style={[styles.stampText, { color: '#7fe0b4' }]}>Ça me tente</Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.stampPass, passStyle]} importantForAccessibility="no-hide-descendants">
          <Text style={[styles.stampText, { color: '#ff9a8a' }]}>Pas pour moi</Text>
        </Animated.View>
        <View style={styles.body}>
          {event.category ? <Text style={styles.category}>{event.category.name}</Text> : null}
          <Text style={styles.when}>{when}</Text>
          <Text style={styles.title} numberOfLines={3}>
            {event.title}
          </Text>
          {where ? (
            <Text style={styles.where} numberOfLines={1}>
              {where}
            </Text>
          ) : null}
          {price.tone !== 'unknown' ? <Text style={[styles.price, price.tone === 'free' && { color: '#7fe0b4' }]}>{price.label}</Text> : null}
        </View>
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  card: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.night },
  body: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20 },
  category: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.accentGlow },
  when: { fontFamily: fonts.semibold, fontSize: 15, color: 'rgba(251,250,247,0.85)', marginTop: 6 },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 31, letterSpacing: -0.6, color: colors.paper, marginTop: 6 },
  where: { fontFamily: fonts.regular, fontSize: 15, color: 'rgba(251,250,247,0.82)', marginTop: 8 },
  price: { fontFamily: fonts.semibold, fontSize: 15, color: colors.paper, marginTop: 4 },
  stamp: { position: 'absolute', top: 24, borderWidth: 3, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 6 },
  stampLike: { left: 20, borderColor: '#7fe0b4', transform: [{ rotate: '-10deg' }] },
  stampPass: { right: 20, borderColor: '#ff9a8a', transform: [{ rotate: '10deg' }] },
  stampText: { fontFamily: fonts.display, fontSize: 22, textTransform: 'uppercase', letterSpacing: 1 },
})
