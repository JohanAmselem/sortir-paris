/**
 * Fiche événement 2.0 (maquette du 23/11/2026) : grande photo, 3 lignes claires
 * (quand, où, prix), UN seul bouton principal « Réserver » avec le prix, Garder
 * à côté ; calendrier et partage en haut ; suivre l'artiste en un geste ; autres
 * dates ; le même lieu. Plus d'avis (le Club sort, décision du 23/11).
 */
import { useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import { ArrowRight, CalendarDays, CalendarPlus, Check, ChevronLeft, MapPin, Share2, Ticket } from 'lucide-react-native'
import { formatCountdown, formatShortDay, formatTime, isLongRun, type CardEvent } from '@/shared'
import { countView, useAttendance, useEvent, useToggleAttend } from '@/lib/queries'
import { useSession } from '@/lib/auth'
import { errorMessage, RedirectSignal } from '@/lib/api'
import { addToCalendar, openBooking, openDirections, shareLink } from '@/lib/actions'
import { showToast } from '@/lib/toast'
import { useStatusBar } from '@/lib/status-bar'
import { EventImage } from '@/components/EventImage'
import { SaveButton } from '@/components/SaveButton'
import { EventCard } from '@/components/EventCard'
import { ArtistFollowButton } from '@/components/event/ArtistFollow'
import { Button, Chip, ErrorState, IconButton, Loading, Notice, SectionHeader, T } from '@/components/ui'
import { colors, fonts, GUTTER, radius, type } from '@/theme'

const HERO = 420

function Fact({ icon, primary, secondary, action, onAction, onPress, label }: { icon: React.ReactNode; primary: string; secondary?: string | null; action?: string; onAction?: () => void; onPress?: () => void; label?: string }) {
  const body = (
    <>
      <View style={styles.factIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.factPrimary}>{primary}</Text>
        {secondary ? <Text style={styles.factSecondary}>{secondary}</Text> : null}
      </View>
      {action && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action} hitSlop={10} onPress={onAction} style={styles.factAction}>
          <Text style={styles.factActionText}>{action}</Text>
        </Pressable>
      ) : null}
    </>
  )
  return onPress ? (
    <Pressable accessibilityRole="link" accessibilityLabel={label ?? primary} onPress={onPress} style={({ pressed }) => [styles.fact, { opacity: pressed ? 0.8 : 1 }]}>
      {body}
    </Pressable>
  ) : (
    <View style={styles.fact}>{body}</View>
  )
}

function Rail({ title, events }: { title: string; events: CardEvent[] }) {
  if (!events.length) return null
  return (
    <View style={{ marginTop: 32 }}>
      <SectionHeader title={title} />
      <FlatList
        horizontal
        data={events}
        keyExtractor={(e) => e.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 12 }}
        renderItem={({ item }) => <EventCard event={item} variant="card" origin="fiche" />}
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
            venue: ev.venue ? { name: ev.venue.name, slug: ev.venue.slug, arrondissement: ev.venue.arrondissement, city: ev.venue.city, lat: ev.venue.lat, lng: ev.venue.lng } : null,
          }
        : null,
    [ev]
  )

  const back = (
    <View style={[styles.topBtns, { top: insets.top + 6 }]} pointerEvents="box-none">
      <IconButton label="Retour" onImage onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
        <ChevronLeft size={22} color={colors.white} />
      </IconButton>
    </View>
  )

  if (!ev || !card) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 60 }}>
        {q.isLoading || q.error instanceof RedirectSignal ? <Loading /> : <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />}
        {back}
      </View>
    )
  }

  const data = q.data!
  const now = new Date()
  const start = new Date(ev.startDate)
  const longRun = isLongRun(ev)
  const isAttending = !!attendance.data?.isAttending
  const attendCount = attendance.data?.count ?? ev.attendanceCount
  const description = (ev.description || ev.shortDesc || '').replace(/\s+\n/g, '\n').trim()
  const long = description.length > 420
  const area = ev.venue ? ev.venue.arrondissement ?? ev.venue.city : null
  const countdown = !longRun && !ev.past ? formatCountdown(start, now) : null
  const whenSecondary = [ev.when.secondary, countdown].filter(Boolean).join(' · ') || null
  const priceKnown = ev.price.tone !== 'unknown'
  const priceShort = ev.price.tone === 'paid' ? ev.price.label.replace(/^(\d+) – (\d+ €)$/, 'dès $1 €').replace(/^Dès/, 'dès') : ev.price.tone === 'free' ? 'gratuit' : null
  const showCta = !!ev.cta && !ev.past

  const onAttend = () => {
    if (!session) return router.push({ pathname: '/connexion', params: { raison: 'jyvais' } })
    attend.mutate(!isAttending)
  }
  const onCalendar = async () => {
    // Heure inconnue ou longue série : journée entière (le jour même pour une expo en cours).
    const allDay = !ev.timeKnown || longRun
    const day = longRun && start < now ? now : start
    const ok = await addToCalendar({
      title: ev.title,
      start: day,
      end: ev.endDate ? new Date(ev.endDate) : null,
      allDay,
      location: ev.venue ? [ev.venue.name, ev.venue.address, ev.venue.zipCode, ev.venue.city].filter(Boolean).join(', ') : null,
      url: ev.webUrl,
      notes: ev.shortDesc,
    })
    if (!ok) showToast('Impossible d’ouvrir le calendrier.')
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingBottom: (showCta ? 110 : 40) + insets.bottom }}>
        <View style={styles.hero}>
          <EventImage uri={ev.imageUrl} categorySlug={ev.category?.slug} title={ev.title} style={StyleSheet.absoluteFill} priority />
          <LinearGradient colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)', 'rgba(12,11,17,0)', colors.bg]} locations={[0, 0.28, 0.6, 1]} style={StyleSheet.absoluteFill} />
        </View>

        <View style={styles.body}>
          {ev.category ? <T v="micro">{ev.category.name}</T> : null}
          <T v="display" accessibilityRole="header" style={{ marginTop: 6 }} numberOfLines={5}>
            {ev.title}
          </T>

          {ev.cancelled ? <View style={styles.notice}><Notice text="Annulé ou reporté d’après l’organisateur : vérifie avant de te déplacer." tone="error" /></View> : null}
          {ev.past && !ev.cancelled ? <View style={styles.notice}><Notice text="Cette sortie est terminée." tone="warning" /></View> : null}

          <View style={styles.facts}>
            <Fact
              icon={<CalendarDays size={20} color={colors.text2} />}
              primary={ev.when.primary}
              secondary={whenSecondary}
              action={!ev.past ? 'Calendrier' : undefined}
              onAction={() => void onCalendar()}
            />
            {ev.venue ? (
              <Fact
                icon={<MapPin size={20} color={colors.text2} />}
                primary={ev.venue.name}
                secondary={[ev.venue.address, area].filter(Boolean).join(' · ') || null}
                label={`Lieu : ${ev.venue.name}`}
                onPress={() => router.push({ pathname: '/lieux/[slug]', params: { slug: ev.venue!.slug } })}
                action="Itinéraire"
                onAction={() => openDirections({ lat: ev.venue!.lat, lng: ev.venue!.lng, name: ev.venue!.name, address: ev.venue!.address })}
              />
            ) : null}
            <Fact
              icon={<Ticket size={20} color={colors.text2} />}
              primary={priceKnown ? ev.price.label : 'Prix sur la billetterie'}
              secondary={ev.soldOut && !ev.past ? 'Complet d’après la billetterie' : priceKnown && ev.price.tone !== 'free' ? 'Selon la billetterie' : null}
            />
          </View>

          {!ev.past ? (
            <View style={styles.attendRow}>
              <Chip
                label={isAttending ? 'J’y vais' : 'J’y vais ?'}
                active={isAttending}
                icon={isAttending ? <Check size={16} color={colors.bg} /> : undefined}
                onPress={onAttend}
              />
              {attendCount > 0 ? (
                <T v="small">
                  {attendCount} membre{attendCount > 1 ? 's y vont' : ' y va'}
                </T>
              ) : null}
            </View>
          ) : null}

          {description ? (
            <View style={{ marginTop: 22 }}>
              <T v="body" numberOfLines={expanded || !long ? undefined : 8}>
                {description}
              </T>
              {long ? (
                <Pressable onPress={() => setExpanded((x) => !x)} accessibilityRole="button" hitSlop={10} style={{ marginTop: 8 }}>
                  <Text style={styles.more}>{expanded ? 'Réduire' : 'Lire la suite'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <T v="small" style={{ marginTop: 12, color: colors.faint }}>
            Infos : {ev.sourceLabel}. Horaires et prix à confirmer sur la billetterie.
          </T>

          {data.artists.length ? (
            <View style={{ marginTop: 28 }}>
              <T v="title2" style={{ marginBottom: 12 }}>
                Alertes concerts
              </T>
              {data.artists.map((a) => (
                <ArtistFollowButton key={a.key} artistKey={a.key} name={a.name} />
              ))}
            </View>
          ) : null}

          {data.otherDates.length ? (
            <View style={{ marginTop: 28 }}>
              <T v="title2" style={{ marginBottom: 6 }}>
                Autres dates
              </T>
              {data.otherDates.slice(0, 8).map((d) => (
                <Pressable key={d.slug} accessibilityRole="link" onPress={() => router.push({ pathname: '/evenements/[slug]', params: { slug: d.slug } })} style={styles.dateRow}>
                  <Text style={styles.dateDay}>
                    {formatShortDay(new Date(d.startDate))} · {formatTime(new Date(d.startDate))}
                  </Text>
                  <Text style={styles.dateVenue} numberOfLines={1}>
                    {[d.venueName, d.arrondissement].filter(Boolean).join(' · ')}
                  </Text>
                </Pressable>
              ))}
              {data.workSlug && data.otherDates.length > 8 ? (
                <Button label="Toutes les dates" kind="secondary" compact style={{ alignSelf: 'flex-start', marginTop: 12 }} onPress={() => router.push({ pathname: '/oeuvres/[slug]', params: { slug: data.workSlug! } })} />
              ) : null}
            </View>
          ) : null}
        </View>

        <Rail title={ev.venue ? `À ${ev.venue.name}` : 'Au même endroit'} events={data.sameVenue} />
        <Rail title="Dans le même esprit" events={data.similar} />
      </ScrollView>

      <View style={[styles.topBtns, { top: insets.top + 6 }]} pointerEvents="box-none">
        <IconButton label="Retour" onImage onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <ChevronLeft size={22} color={colors.white} />
        </IconButton>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {!ev.past ? (
            <IconButton label="Ajouter au calendrier" onImage onPress={() => void onCalendar()}>
              <CalendarPlus size={19} color={colors.white} />
            </IconButton>
          ) : null}
          <IconButton label="Partager" onImage onPress={() => void shareLink(ev.title, ev.webUrl)}>
            <Share2 size={19} color={colors.white} />
          </IconButton>
        </View>
      </View>

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 10 }]}>
        <SaveButton event={card} size={20} style={styles.ctaSave} />
        {showCta ? (
          <Button
            label={ev.cta!.label === 'Réserver' || /billet/i.test(ev.cta!.label) ? 'Réserver' : ev.cta!.label}
            trailing={
              <>
                {priceShort ? <Text style={styles.ctaPrice}>· {priceShort}</Text> : null}
                <ArrowRight size={18} color={colors.white} />
              </>
            }
            onPress={() => void openBooking(ev.cta!.url, ev.sourceLabel)}
            style={{ flex: 1 }}
          />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <T v="small">{ev.past ? 'Sortie terminée' : 'Pas de billetterie en ligne : infos sur place.'}</T>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { height: HERO, backgroundColor: colors.surface2 },
  topBtns: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  body: { paddingHorizontal: GUTTER, marginTop: -44 },
  notice: { marginHorizontal: -GUTTER, marginTop: 14 },
  facts: { marginTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, minHeight: 60 },
  factIcon: { width: 24, alignItems: 'center' },
  factPrimary: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: colors.text },
  factSecondary: { ...type.small, color: colors.muted, marginTop: 1 },
  factAction: { minHeight: 44, justifyContent: 'center', paddingLeft: 8 },
  factActionText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accent },
  attendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  more: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accent },
  dateRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  dateDay: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  dateVenue: { ...type.small, color: colors.muted, marginTop: 1 },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: GUTTER,
    paddingTop: 12,
    backgroundColor: colors.glass,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  ctaSave: { width: 52, height: 52, borderRadius: 16, borderWidth: 1, borderColor: colors.line2, backgroundColor: 'transparent' },
  ctaPrice: { fontFamily: fonts.medium, fontSize: 14, color: colors.onImage },
})
