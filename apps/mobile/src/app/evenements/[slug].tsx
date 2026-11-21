/**
 * Fiche événement : les mêmes informations et règles que la fiche du site
 * (/evenements/[slug]), avec les gestes du téléphone : calendrier, itinéraire,
 * partage, notification des artistes suivis.
 */
import { useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { CalendarPlus, Check, MapPin, Navigation, Share2, Ticket } from 'lucide-react-native'
import { formatShortDay, formatTime, type CardEvent } from '@/shared'
import { countView, useAttendance, useEvent, useToggleAttend } from '@/lib/queries'
import { useSession } from '@/lib/auth'
import { errorMessage, RedirectSignal } from '@/lib/api'
import { addToCalendar, openBooking, openDirections, shareLink } from '@/lib/actions'
import { EventImage } from '@/components/EventImage'
import { SaveButton } from '@/components/SaveButton'
import { EventCard } from '@/components/EventCard'
import { ArtistFollowButton } from '@/components/event/ArtistFollow'
import { Reviews } from '@/components/event/Reviews'
import { Button, ErrorState, Loading, Notice, SectionHeader, T } from '@/components/ui'
import { colors, fonts, GUTTER } from '@/theme'
import { useStatusBar } from '@/lib/status-bar'

function Action({ icon, label, onPress, active }: { icon: React.ReactNode; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active }} onPress={onPress} style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.actionIcon, active && { backgroundColor: colors.accent, borderColor: colors.accent }]}>{icon}</View>
      <Text style={styles.actionLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

function Rail({ title, kicker, events }: { title: string; kicker?: string; events: CardEvent[] }) {
  if (!events.length) return null
  return (
    <View style={{ marginTop: 32 }}>
      <SectionHeader kicker={kicker} title={title} />
      <FlatList
        horizontal
        data={events}
        keyExtractor={(e) => e.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}
        renderItem={({ item }) => <EventCard event={item} variant="poster" width={220} origin="fiche" />}
      />
    </View>
  )
}

export default function EventScreen() {
  useStatusBar('light')
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const insets = useSafeAreaInsets()
  const session = useSession()
  const q = useEvent(slug)
  const ev = q.data?.event
  const attendance = useAttendance(ev?.id)
  const attend = useToggleAttend(ev?.id ?? '')
  const [expanded, setExpanded] = useState(false)
  const [calendarMsg, setCalendarMsg] = useState<string | null>(null)

  useEffect(() => {
    if (q.error instanceof RedirectSignal) router.replace({ pathname: '/evenements/[slug]', params: { slug: q.error.to } })
  }, [q.error])
  useEffect(() => {
    if (ev?.id) countView(ev.id)
  }, [ev?.id])

  // La sortie, sous forme de carte (pour « Garder »).
  const card = useMemo<CardEvent | null>(
    () =>
      ev
        ? {
            id: ev.id,
            slug: ev.slug,
            title: ev.title,
            shortDesc: ev.shortDesc,
            imageUrl: ev.imageUrl,
            startDate: ev.startDate,
            endDate: ev.endDate,
            timeKnown: ev.timeKnown,
            priceMin: ev.priceMin,
            priceMax: ev.priceMax,
            priceStatus: ev.priceStatus,
            isFree: ev.isFree,
            saveCount: ev.saveCount,
            qualityScore: 0,
            category: ev.category ? { ...ev.category, icon: null } : null,
            venue: ev.venue
              ? { name: ev.venue.name, slug: ev.venue.slug, arrondissement: ev.venue.arrondissement, city: ev.venue.city, lat: ev.venue.lat, lng: ev.venue.lng }
              : null,
          }
        : null,
    [ev]
  )

  if (!ev) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: insets.top + 60 }}>
        <Stack.Screen options={{ headerTintColor: colors.ink }} />
        {q.isLoading || q.error instanceof RedirectSignal ? <Loading /> : <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      </View>
    )
  }

  const data = q.data!
  const isAttending = !!attendance.data?.isAttending
  const attendCount = attendance.data?.count ?? ev.attendanceCount
  const description = (ev.description || ev.shortDesc || '').replace(/\s+\n/g, '\n').trim()
  const long = description.length > 420
  const area = ev.venue ? ev.venue.arrondissement ?? ev.venue.city : null

  const onAttend = () => {
    if (!session) return router.push({ pathname: '/connexion', params: { raison: 'jyvais' } })
    attend.mutate(!isAttending)
  }
  const onCalendar = async () => {
    const ok = await addToCalendar({
      title: ev.title,
      start: new Date(ev.startDate),
      end: ev.endDate ? new Date(ev.endDate) : null,
      location: ev.venue ? [ev.venue.name, ev.venue.address, ev.venue.zipCode, ev.venue.city].filter(Boolean).join(', ') : null,
      url: ev.webUrl,
      notes: ev.shortDesc,
    })
    if (!ok) setCalendarMsg('Impossible d’ouvrir le calendrier.')
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Stack.Screen
        options={{
          headerTintColor: colors.paper,
          headerRight: () => (
            <Pressable onPress={() => shareLink(ev.title, ev.webUrl)} accessibilityLabel="Partager" hitSlop={10} style={styles.headerBtn}>
              <Share2 size={20} color={colors.paper} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: (ev.cta && !ev.past ? 96 : 32) + insets.bottom }}>
        <View style={styles.hero}>
          <EventImage uri={ev.imageUrl} categorySlug={ev.category?.slug} style={StyleSheet.absoluteFill} priority />
          <LinearGradient colors={['rgba(19,16,39,0.55)', 'transparent', 'rgba(19,16,39,0.15)']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
        </View>

        <View style={styles.body}>
          {ev.category ? <T v="kicker">{ev.category.name}</T> : null}
          <T v="h1" accessibilityRole="header" style={{ marginTop: 4 }}>
            {ev.title}
          </T>

          {ev.cancelled ? <View style={{ marginHorizontal: -GUTTER, marginTop: 12 }}><Notice text="Annulé ou reporté d’après l’organisateur : vérifie avant de te déplacer." tone="error" /></View> : null}
          {ev.past && !ev.cancelled ? <View style={{ marginHorizontal: -GUTTER, marginTop: 12 }}><Notice text="Cette sortie est terminée." tone="warning" /></View> : null}
          {ev.soldOut && !ev.past ? <View style={{ marginHorizontal: -GUTTER, marginTop: 12 }}><Notice text="Complet d’après la billetterie." tone="warning" /></View> : null}

          <View style={styles.facts}>
            <View style={styles.fact}>
              <Text style={styles.factPrimary}>{ev.when.primary}</Text>
              {ev.when.secondary ? <Text style={styles.factSecondary}>{ev.when.secondary}</Text> : null}
              {ev.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{ev.badge}</Text>
                </View>
              ) : null}
            </View>
            {ev.venue ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Lieu : ${ev.venue.name}`}
                onPress={() => router.push({ pathname: '/lieux/[slug]', params: { slug: ev.venue!.slug } })}
                style={styles.fact}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <MapPin size={16} color={colors.accent} />
                  <Text style={[styles.factPrimary, { color: colors.accent }]}>{ev.venue.name}</Text>
                </View>
                <Text style={styles.factSecondary}>{[ev.venue.address, area].filter(Boolean).join(' · ')}</Text>
              </Pressable>
            ) : null}
            {ev.price.tone !== 'unknown' ? (
              <View style={styles.fact}>
                <Text style={[styles.factPrimary, ev.price.tone === 'free' && { color: colors.free }]}>{ev.price.label}</Text>
              </View>
            ) : (
              <View style={styles.fact}>
                <Text style={styles.factSecondary}>Prix non communiqué</Text>
              </View>
            )}
          </View>

          <View style={styles.actions}>
            <View style={styles.action}>
              <SaveButton event={card!} size={20} style={styles.actionIcon} />
              <Text style={styles.actionLabel}>Garder</Text>
            </View>
            {!ev.past ? (
              <Action
                icon={isAttending ? <Check size={20} color={colors.paper} /> : <Ticket size={20} color={colors.ink} />}
                label={isAttending ? 'J’y vais !' : 'J’y vais'}
                active={isAttending}
                onPress={onAttend}
              />
            ) : null}
            {!ev.past ? <Action icon={<CalendarPlus size={20} color={colors.ink} />} label="Calendrier" onPress={onCalendar} /> : null}
            {ev.venue ? (
              <Action
                icon={<Navigation size={20} color={colors.ink} />}
                label="Itinéraire"
                onPress={() => openDirections({ lat: ev.venue!.lat, lng: ev.venue!.lng, name: ev.venue!.name, address: ev.venue!.address })}
              />
            ) : null}
            <Action icon={<Share2 size={20} color={colors.ink} />} label="Partager" onPress={() => shareLink(ev.title, ev.webUrl)} />
          </View>
          {attendCount > 0 && !ev.past ? (
            <T v="caption" style={{ marginTop: 10 }}>
              {attendCount} membre{attendCount > 1 ? 's y vont' : ' y va'}
            </T>
          ) : null}
          {calendarMsg ? <T v="caption" style={{ color: colors.error, marginTop: 8 }}>{calendarMsg}</T> : null}

          {description ? (
            <View style={{ marginTop: 24 }}>
              <T v="body" numberOfLines={expanded || !long ? undefined : 8}>
                {description}
              </T>
              {long ? (
                <Pressable onPress={() => setExpanded((x) => !x)} accessibilityRole="button" hitSlop={8} style={{ marginTop: 6 }}>
                  <Text style={styles.more}>{expanded ? 'Réduire' : 'Lire la suite'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <T v="caption" style={{ marginTop: 14 }}>
            Source : {ev.sourceLabel}. Horaires et prix à vérifier auprès de l’organisateur.
          </T>

          {data.artists.length ? (
            <View style={{ marginTop: 28 }}>
              <T v="kicker">Alertes concerts</T>
              <T v="h2" style={{ marginTop: 2, marginBottom: 10 }}>
                Ne rate plus leurs dates
              </T>
              {data.artists.map((a) => (
                <ArtistFollowButton key={a.key} artistKey={a.key} name={a.name} />
              ))}
            </View>
          ) : null}

          {data.otherDates.length ? (
            <View style={{ marginTop: 28 }}>
              <T v="kicker">Aussi programmé</T>
              <T v="h2" style={{ marginTop: 2, marginBottom: 6 }}>
                Autres dates
              </T>
              {data.otherDates.slice(0, 8).map((d) => (
                <Pressable
                  key={d.slug}
                  accessibilityRole="link"
                  onPress={() => router.push({ pathname: '/evenements/[slug]', params: { slug: d.slug } })}
                  style={styles.dateRow}>
                  <Text style={styles.dateDay}>
                    {formatShortDay(new Date(d.startDate))} · {formatTime(new Date(d.startDate))}
                  </Text>
                  <Text style={styles.dateVenue} numberOfLines={1}>
                    {[d.venueName, d.arrondissement].filter(Boolean).join(' · ')}
                  </Text>
                </Pressable>
              ))}
              {data.workSlug && data.otherDates.length > 8 ? (
                <Button
                  label="Toutes les dates"
                  kind="secondary"
                  compact
                  style={{ alignSelf: 'flex-start', marginTop: 10 }}
                  onPress={() => router.push({ pathname: '/oeuvres/[slug]', params: { slug: data.workSlug! } })}
                />
              ) : null}
            </View>
          ) : null}

          <Reviews eventId={ev.id} />
        </View>

        <Rail kicker="Même adresse" title={ev.venue ? `À ${ev.venue.name}` : 'Au même endroit'} events={data.sameVenue} />
        <Rail kicker="Dans le même esprit" title="Tu aimeras aussi" events={data.similar} />
      </ScrollView>

      {ev.cta && !ev.past ? (
        <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 10 }]}>
          <Button label={ev.cta.label} kind="accent" onPress={() => openBooking(ev.cta!.url, ev.sourceLabel)} style={{ flex: 1 }} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { height: 340, backgroundColor: colors.night },
  headerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(19,16,39,0.35)' },
  body: { paddingHorizontal: GUTTER, paddingTop: 20 },
  facts: { marginTop: 18, gap: 14 },
  fact: { gap: 2 },
  factPrimary: { fontFamily: fonts.semibold, fontSize: 17, color: colors.ink },
  factSecondary: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary },
  badge: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: colors.neon, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.paper },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  action: { alignItems: 'center', gap: 6, minWidth: 58 },
  actionIcon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  actionLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.ink },
  more: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accent },
  dateRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dateDay: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  dateVenue: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: GUTTER,
    paddingTop: 10,
    backgroundColor: 'rgba(251,250,247,0.97)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    flexDirection: 'row',
  },
})

