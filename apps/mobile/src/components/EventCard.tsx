/**
 * La carte de sortie, une seule, en 5 formats (même ordre de lecture partout :
 * QUAND → QUOI → OÙ → PRIX → POURQUOI) :
 *   poster  grande photo plein cadre, texte sur dégradé (Notre choix)
 *   card    photo + 3 lignes, pour les rails (Ce week-end)
 *   big     pavé de date sur la photo (Les grosses dates)
 *   row     vignette 76 pt, pour les listes (Agenda, Expos)
 *   ticket  billet daté (Mes sorties)
 */
import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { MapPin, Sparkles } from 'lucide-react-native'
import { formatFilmTimes, formatPrice, formatWhen, parisParts, type CardEvent } from '@/shared'
import { colors, fonts, radius, type } from '@/theme'
import { EventImage } from './EventImage'
import { SaveButton } from './SaveButton'
import { track } from '@/lib/analytics'

export type CardVariant = 'poster' | 'card' | 'big' | 'row' | 'ticket' | 'feature' | 'tile'

export function venueArea(venue: CardEvent['venue']): string | null {
  if (!venue) return null
  return venue.arrondissement ?? venue.city ?? null
}

export function filmCounts(film: NonNullable<CardEvent['film']>): string {
  const seances = `${film.seances} séance${film.seances > 1 ? 's' : ''}`
  return film.salles > 1 ? `${seances} · ${film.salles} salles` : seances
}

function whenOf(event: CardEvent, now: Date) {
  const label = (event.film && formatFilmTimes(event.film.nextTimes, now)) || formatWhen(event, now)
  const hot = /^(Dernier jour|Plus que|Dans \d)/.test(label)
  return { label, hot }
}

function placeOf(event: CardEvent): string | null {
  if (event.film) return event.film.salles > 1 ? filmCounts(event.film) : `${event.venue?.name ?? ''} · ${filmCounts(event.film)}`
  if (!event.venue) return null
  const area = venueArea(event.venue)
  return area ? `${event.venue.name} · ${area}` : event.venue.name
}

/** Prix des cartes : rien quand on ne le connaît pas (la fiche le dit). */
function priceOf(event: CardEvent): { label: string; free: boolean } | null {
  const p = formatPrice(event)
  if (p.tone === 'unknown') return null
  return { label: p.label, free: p.tone === 'free' }
}

export function openEvent(event: CardEvent, origin?: string) {
  track('event_open', { origin: origin ?? null })
  if (event.film) router.push({ pathname: '/films/[slug]', params: { slug: event.film.slug } })
  else router.push({ pathname: '/evenements/[slug]', params: { slug: event.slug } })
}

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const WEEKDAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

/** « 17 » + « févr. 27 » (année quand ce n'est pas l'année en cours). */
export function dateBlock(iso: string, now = new Date()) {
  const p = parisParts(new Date(iso))
  const y = p.year !== parisParts(now).year ? ` ${String(p.year).slice(2)}` : ''
  return { day: String(p.day), month: `${MONTHS_SHORT[p.month - 1]}${y}`, weekday: WEEKDAYS_SHORT[p.weekday] }
}

function a11y(event: CardEvent, when: string, place: string | null, price: string | null) {
  return [event.title, when, place, price, event.reason].filter(Boolean).join(', ')
}

export const EventCard = memo(function EventCard({
  event,
  variant = 'row',
  origin,
  width,
  tag,
}: {
  event: CardEvent
  variant?: CardVariant
  origin?: string
  width?: number
  /** Étiquette du billet (« Gardée », « J’y vais »). */
  tag?: string
}) {
  const now = new Date()
  const when = whenOf(event, now)
  const price = priceOf(event)
  const place = placeOf(event)
  const label = a11y(event, when.label, place, price?.label ?? null)
  const onPress = () => openEvent(event, origin)
  const v = variant === 'feature' ? 'poster' : variant === 'tile' ? 'card' : variant

  if (v === 'poster') {
    const meta = [place, price?.label].filter(Boolean).join(' · ')
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.poster, { width: width ?? 300, opacity: pressed ? 0.92 : 1 }]}>
        <EventImage uri={event.imageUrl} categorySlug={event.category?.slug} title={event.title} style={StyleSheet.absoluteFill} priority />
        <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.86)']} locations={[0.3, 0.55, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.cornerSave}>
          <SaveButton event={event} onImage size={19} />
        </View>
        <View style={styles.posterBody}>
          <Text style={styles.posterWhen} numberOfLines={1}>
            {[when.label, event.category?.name].filter(Boolean).join(' · ')}
          </Text>
          <Text style={styles.posterTitle} numberOfLines={3}>
            {event.title}
          </Text>
          {meta ? (
            <Text style={styles.posterMeta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          {event.reason ? (
            <View style={styles.why}>
              <Sparkles size={13} color={colors.white} />
              <Text style={styles.whyText}>{event.reason}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    )
  }

  if (v === 'card') {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [{ width: width ?? 200, opacity: pressed ? 0.85 : 1 }]}>
        <View style={styles.cardMedia}>
          <EventImage uri={event.imageUrl} categorySlug={event.category?.slug} title={event.title} style={StyleSheet.absoluteFill} />
          <View style={styles.cornerSaveSmall}>
            <SaveButton event={event} onImage small size={17} />
          </View>
        </View>
        <Text style={[styles.when, when.hot && styles.hot]} numberOfLines={1}>
          {when.label}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        {place ? (
          <Text style={styles.meta} numberOfLines={1}>
            {place}
          </Text>
        ) : null}
      </Pressable>
    )
  }

  if (v === 'big') {
    const d = dateBlock(event.startDate, now)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.big, { width: width ?? 250, opacity: pressed ? 0.88 : 1 }]}>
        <View style={styles.bigMedia}>
          <EventImage uri={event.imageUrl} categorySlug={event.category?.slug} title={event.title} style={StyleSheet.absoluteFill} />
          <View style={styles.dateBox}>
            <Text style={styles.dateDay}>{d.day}</Text>
            <Text style={styles.dateMonth}>{d.month}</Text>
          </View>
        </View>
        <View style={styles.bigBody}>
          <Text style={styles.bigTitle} numberOfLines={2}>
            {event.title}
          </Text>
          {place ? (
            <Text style={styles.meta} numberOfLines={1}>
              {place}
            </Text>
          ) : null}
          {event.isNew ? (
            <View style={styles.badge}>
              <Sparkles size={12} color={colors.hotText} />
              <Text style={styles.badgeText}>Nouvelle date</Text>
            </View>
          ) : price ? (
            <Text style={[styles.price, price.free && styles.free, { marginTop: 8 }]}>{price.label}</Text>
          ) : null}
        </View>
      </Pressable>
    )
  }

  if (v === 'ticket') {
    const d = dateBlock(event.startDate, now)
    const time = event.timeKnown ? when.label.split(' · ').at(-1) : null
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={[label, tag].filter(Boolean).join(', ')} onPress={onPress} style={({ pressed }) => [styles.ticket, { opacity: pressed ? 0.88 : 1 }]}>
        <View style={styles.ticketDate}>
          <Text style={styles.ticketWeekday}>{d.weekday}</Text>
          <Text style={styles.ticketDay}>{d.day}</Text>
          <Text style={styles.ticketWeekday}>{d.month}</Text>
        </View>
        <View style={styles.ticketBody}>
          <Text style={styles.when} numberOfLines={1}>
            {[time && /\d/.test(time) ? time : null, event.venue?.name].filter(Boolean).join(' · ') || when.label}
          </Text>
          <Text style={styles.title} numberOfLines={2}>
            {event.title}
          </Text>
          {tag ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.ticketThumb}>
          <EventImage uri={event.imageUrl} categorySlug={event.category?.slug} compact style={StyleSheet.absoluteFill} />
        </View>
      </Pressable>
    )
  }

  // row
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.8 : 1 }]}>
      <View style={styles.thumb}>
        <EventImage uri={event.imageUrl} categorySlug={event.category?.slug} compact style={StyleSheet.absoluteFill} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.when, { marginTop: 0 }, when.hot && styles.hot]} numberOfLines={1}>
          {when.label}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        {place ? (
          <View style={styles.placeRow}>
            <MapPin size={13} color={colors.muted} />
            <Text style={[styles.meta, { marginTop: 0, flexShrink: 1 }]} numberOfLines={1}>
              {event.distanceKm != null ? `${place} · ${event.distanceKm.toLocaleString('fr-FR')} km` : place}
            </Text>
          </View>
        ) : null}
        {event.isNew ? (
          <Text style={styles.newText}>Nouvelle date</Text>
        ) : event.reason ? (
          <Text style={styles.reason} numberOfLines={1}>
            {event.reason}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowRight}>
        <SaveButton event={event} small size={17} />
        {price ? <Text style={[styles.price, price.free && styles.free]}>{price.label}</Text> : null}
      </View>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  poster: { height: 380, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surface2 },
  posterBody: { position: 'absolute', left: 16, right: 16, bottom: 16 },
  posterWhen: { ...type.micro, color: colors.onImage },
  posterTitle: { fontFamily: fonts.display, fontSize: 30, lineHeight: 31, color: colors.white, marginTop: 6 },
  posterMeta: { fontFamily: fonts.regular, fontSize: 14, color: colors.onImage, marginTop: 8 },
  why: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full, backgroundColor: colors.onImageSoft },
  whyText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.white },
  cornerSave: { position: 'absolute', top: 12, right: 12, zIndex: 2 },
  cornerSaveSmall: { position: 'absolute', top: 6, right: 6, zIndex: 2 },
  cardMedia: { height: 136, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface2 },
  when: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accent, marginTop: 10 },
  hot: { color: colors.hotText },
  title: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: colors.text, marginTop: 3 },
  meta: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, marginTop: 3 },
  price: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  free: { color: colors.free },
  big: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  bigMedia: { height: 150, backgroundColor: colors.surface2 },
  bigBody: { padding: 14 },
  bigTitle: { ...type.title3, color: colors.text },
  dateBox: { position: 'absolute', left: 12, top: 12, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 7, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center' },
  dateDay: { fontFamily: fonts.display, fontSize: 26, lineHeight: 27, color: colors.text },
  dateMonth: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.text, marginTop: 1 },
  badge: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 5, marginTop: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.hotSoft },
  badgeText: { fontFamily: fonts.bold, fontSize: 12, color: colors.hotText },
  newText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.hotText, marginTop: 3 },
  reason: { fontFamily: fonts.medium, fontSize: 12, color: colors.accent, marginTop: 3 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, alignItems: 'center' },
  thumb: { width: 76, height: 76, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface2 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, minWidth: 0 },
  rowRight: { alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch', gap: 8 },
  ticket: { flexDirection: 'row', borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  ticketDate: { width: 64, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, backgroundColor: colors.surface2, borderRightWidth: 1, borderRightColor: colors.line2, borderStyle: 'dashed' },
  ticketWeekday: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted },
  ticketDay: { fontFamily: fonts.display, fontSize: 28, lineHeight: 30, color: colors.text },
  ticketBody: { flex: 1, minWidth: 0, paddingVertical: 12, paddingLeft: 12 },
  ticketThumb: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden', alignSelf: 'center', margin: 12, backgroundColor: colors.surface2 },
  tag: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.accentSoft },
  tagText: { fontFamily: fonts.bold, fontSize: 12, color: colors.accent },
})
