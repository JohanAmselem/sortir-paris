/**
 * Cartes de sortie, dans l'ordre où l'on décide (comme sur le site) :
 * 1. QUAND (relatif, heure de Paris)  2. QUOI  3. OÙ (lieu + arrondissement)
 * 4. PRIX (gratuit / payant / inconnu)  5. POURQUOI (raison, si connue).
 */
import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { MapPin } from 'lucide-react-native'
import { formatFilmTimes, formatPrice, formatWhen, isLongRun, urgencyBadge, type CardEvent } from '@/shared'
import { colors, fonts, radius } from '@/theme'
import { EventImage } from './EventImage'
import { SaveButton } from './SaveButton'
import { track } from '@/lib/analytics'

export type CardVariant = 'row' | 'feature' | 'tile' | 'poster'

export function venueArea(venue: CardEvent['venue']): string | null {
  if (!venue) return null
  return venue.arrondissement ?? venue.city ?? null
}

export function filmCounts(film: NonNullable<CardEvent['film']>): string {
  const seances = `${film.seances} séance${film.seances > 1 ? 's' : ''}`
  return film.salles > 1 ? `${seances} · ${film.salles} salles` : seances
}

function whenTone(event: CardEvent, now: Date) {
  const label = (event.film && formatFilmTimes(event.film.nextTimes, now)) || formatWhen(event, now)
  const hot = /^(Ce soir|En ce moment|Dernier jour|Plus que)/.test(label)
  return { label, hot }
}

function where(event: CardEvent): string | null {
  if (event.film) return event.film.salles > 1 ? filmCounts(event.film) : `${event.venue?.name ?? ''} · ${filmCounts(event.film)}`
  if (!event.venue) return null
  const area = venueArea(event.venue)
  return area ? `${event.venue.name} · ${area}` : event.venue.name
}

export function openEvent(event: CardEvent, origin?: string) {
  track('event_open', { origin: origin ?? null })
  if (event.film) router.push({ pathname: '/films/[slug]', params: { slug: event.film.slug } })
  else router.push({ pathname: '/evenements/[slug]', params: { slug: event.slug } })
}

function a11yLabel(event: CardEvent, when: string, place: string | null, price: string | null) {
  return [event.title, when, place, price, event.reason].filter(Boolean).join(', ')
}

export const EventCard = memo(function EventCard({
  event,
  variant = 'row',
  rank,
  origin,
  width,
}: {
  event: CardEvent
  variant?: CardVariant
  rank?: number
  origin?: string
  width?: number
}) {
  const now = new Date()
  const when = whenTone(event, now)
  const price = formatPrice(event)
  const place = where(event)
  const badge = urgencyBadge(event, now)
  const label = a11yLabel(event, when.label, place, price.tone === 'unknown' ? null : price.label)
  const onPress = () => openEvent(event, origin)

  if (variant === 'feature') {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.feature, { opacity: pressed ? 0.92 : 1 }]}>
        <EventImage uri={event.imageUrl} categorySlug={event.category?.slug} style={StyleSheet.absoluteFill} priority />
        <LinearGradient colors={['transparent', 'rgba(19,16,39,0.45)', colors.night]} locations={[0.25, 0.55, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.saveCorner}>
          <SaveButton event={event} onDark />
        </View>
        <View style={styles.featureBody}>
          <View style={styles.featureWhenRow}>
            {rank != null ? <Text style={styles.rank}>{rank}</Text> : null}
            <Text style={[styles.featureWhen, when.hot && { color: colors.accentGlow }]}>{when.label}</Text>
          </View>
          <Text style={styles.featureTitle} numberOfLines={3}>
            {event.title}
          </Text>
          <View style={styles.featureMeta}>
            {place ? (
              <Text style={styles.featureMetaText} numberOfLines={1}>
                {place}
              </Text>
            ) : null}
            {price.tone !== 'unknown' ? <Text style={[styles.featurePrice, price.tone === 'free' && { color: '#7fe0b4' }]}>{price.label}</Text> : null}
          </View>
          {event.reason ? <Text style={styles.featureReason}>{event.reason}</Text> : null}
        </View>
      </Pressable>
    )
  }

  if (variant === 'tile' || variant === 'poster') {
    const tile = variant === 'tile'
    const w = width ?? (tile ? 168 : 250)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [{ width: w, opacity: pressed ? 0.85 : 1 }]}>
        <View style={[styles.media, { aspectRatio: tile ? 3 / 4 : 4 / 3 }]}>
          <EventImage uri={event.imageUrl} categorySlug={event.category?.slug} style={StyleSheet.absoluteFill} />
          {badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
          <View style={styles.saveCornerSmall}>
            <SaveButton event={event} size={18} />
          </View>
        </View>
        {!tile ? <Text style={[styles.when, when.hot && styles.hot]}>{when.label}</Text> : null}
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        {place ? (
          <Text style={styles.place} numberOfLines={1}>
            {place}
          </Text>
        ) : null}
        {tile ? (
          <Text style={[styles.place, when.hot && { color: colors.neon, fontFamily: fonts.semibold }]}>
            {isLongRun(event) ? when.label.replace(/^En cours · /, '') : when.label}
          </Text>
        ) : price.tone !== 'unknown' ? (
          <Text style={[styles.price, price.tone === 'free' && styles.free]}>{price.label}</Text>
        ) : null}
      </Pressable>
    )
  }

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.8 : 1 }]}>
      <View style={styles.thumb}>
        <EventImage uri={event.imageUrl} categorySlug={event.category?.slug} style={StyleSheet.absoluteFill} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowTop}>
          {rank != null ? <Text style={styles.rowRank}>{rank}</Text> : null}
          <Text style={[styles.when, { marginTop: 0, flex: 1 }, when.hot && styles.hot]} numberOfLines={1}>
            {when.label}
          </Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        <View style={styles.rowMeta}>
          {place ? (
            <View style={styles.placeRow}>
              <MapPin size={13} color={colors.textMuted} />
              <Text style={[styles.place, { marginTop: 0, flexShrink: 1 }]} numberOfLines={1}>
                {place}
              </Text>
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {price.tone !== 'unknown' ? <Text style={[styles.price, { marginTop: 0 }, price.tone === 'free' && styles.free]}>{price.label}</Text> : null}
        </View>
        {event.reason ? (
          <Text style={styles.reason} numberOfLines={2}>
            {event.reason}
          </Text>
        ) : null}
      </View>
      <SaveButton event={event} size={18} />
    </Pressable>
  )
})

const styles = StyleSheet.create({
  feature: { height: 380, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.night },
  featureBody: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18 },
  featureWhenRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  rank: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42, color: colors.paper },
  featureWhen: { fontFamily: fonts.semibold, fontSize: 15, color: 'rgba(251,250,247,0.82)' },
  featureTitle: { fontFamily: fonts.display, fontSize: 30, lineHeight: 30, letterSpacing: -0.6, color: colors.paper, marginTop: 6 },
  featureMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  featureMetaText: { fontFamily: fonts.regular, fontSize: 14, color: 'rgba(251,250,247,0.82)', flexShrink: 1 },
  featurePrice: { fontFamily: fonts.semibold, fontSize: 14, color: colors.paper },
  featureReason: { fontFamily: fonts.medium, fontSize: 13, color: colors.accentGlow, marginTop: 8 },
  saveCorner: { position: 'absolute', top: 12, right: 12, zIndex: 2 },
  saveCornerSmall: { position: 'absolute', top: 8, right: 8 },
  media: { width: '100%', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.paperDeep },
  badge: { position: 'absolute', left: 8, top: 8, backgroundColor: colors.neon, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.paper },
  when: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textSecondary, marginTop: 8 },
  hot: { color: colors.accent },
  title: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.ink, marginTop: 2 },
  place: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  price: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink, marginTop: 3 },
  free: { color: colors.free },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 10, alignItems: 'flex-start' },
  thumb: { width: 76, height: 76, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.paperDeep },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowRank: { fontFamily: fonts.display, fontSize: 18, color: colors.accent },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 },
  reason: { fontFamily: fonts.medium, fontSize: 12, color: colors.accent, marginTop: 3 },
})
