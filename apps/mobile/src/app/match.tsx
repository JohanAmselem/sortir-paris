/**
 * Match : les sorties du mois en cartes. Droite = « ça me tente » (signal de
 * goût pour le Drop et l'ADN ; la sortie n'est pas gardée), gauche = « pas pour moi ».
 * 30 swipes par jour. Sans compte : swipes gardés sur le téléphone, repris à la
 * connexion ; après 8, invitation à créer un compte. Données : GET/POST /api/swipe.
 */
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Heart, Info, X } from 'lucide-react-native'
import type { CardEvent } from '@/shared'
import { useSwipeDeck } from '@/lib/queries'
import { useSession } from '@/lib/auth'
import { useLocalState } from '@/lib/local-store'
import { MATCH_DAILY_LIMIT, MATCH_SIGNUP_NUDGE_AT, useRecordSwipe, type SwipeDirection } from '@/lib/club'
import { ApiError, errorMessage } from '@/lib/api'
import { Button, ErrorState, Loading, T } from '@/components/ui'
import { EventCard, openEvent } from '@/components/EventCard'
import { SwipeCard } from '@/components/club/SwipeCard'
import { colors, fonts, GUTTER, radius } from '@/theme'
import { useStatusBar } from '@/lib/status-bar'

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString()

export default function MatchScreen() {
  useStatusBar('light')
  const insets = useSafeAreaInsets()
  const deck = useSwipeDeck()

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 10 }]}>
      {deck.isPending ? (
        <Loading label="On mélange les cartes…" />
      ) : deck.isError || !deck.data ? (
        <ErrorState message={errorMessage(deck.error)} onRetry={() => deck.refetch()} />
      ) : (
        <Game
          key={deck.dataUpdatedAt}
          events={deck.data.events}
          serverRemaining={deck.data.remaining}
          serverLiked={deck.data.liked}
          onReload={() => deck.refetch()}
        />
      )}
    </View>
  )
}

function Game({
  events,
  serverRemaining,
  serverLiked,
  onReload,
}: {
  events: CardEvent[]
  serverRemaining: number
  serverLiked: CardEvent[]
  onReload: () => void
}) {
  const session = useSession()
  const record = useRecordSwipe()
  const localSwipes = useLocalState((s) => s.swipes)
  const [index, setIndex] = useState(0)
  const [liked, setLiked] = useState<CardEvent[]>([])
  const [remoteRemaining, setRemoteRemaining] = useState(serverRemaining)
  const [fling, setFling] = useState<{ direction: SwipeDirection; nonce: number } | null>(null)
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // Sans compte : on retire les cartes déjà jouées sur ce téléphone.
  const deck = useMemo(() => {
    if (session) return events
    const done = new Set(localSwipes.map((s) => s.eventId))
    return events.filter((e) => !done.has(e.id))
    // Calculé une fois par pile : la pile ne doit pas bouger pendant la partie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, session])

  const localToday = localSwipes.filter((s) => isToday(s.at)).length
  const remaining = session ? remoteRemaining : Math.max(0, MATCH_DAILY_LIMIT - localToday)
  const current = deck[index]
  const next = deck[index + 1]
  const showNudge = !session && !nudgeDismissed && localToday >= MATCH_SIGNUP_NUDGE_AT

  const onSwiped = (direction: SwipeDirection) => {
    const event = deck[index]
    if (!event) return
    setFling(null)
    setIndex((i) => i + 1)
    if (direction === 'right') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      setLiked((l) => [event, ...l.filter((e) => e.id !== event.id)])
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    }
    if (session) setRemoteRemaining((r) => Math.max(0, r - 1))
    record.mutate(
      { event, direction },
      {
        onSuccess: (res) => {
          if (res) setRemoteRemaining(res.remaining)
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 429) setRemoteRemaining(0)
          setNotice(errorMessage(err))
        },
      }
    )
  }

  const press = (direction: SwipeDirection) => {
    if (!current || remaining <= 0) return
    setFling({ direction, nonce: Date.now() })
  }

  const recap = useMemo(() => {
    const seen = new Set<string>()
    return [...liked, ...serverLiked].filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
  }, [liked, serverLiked])

  const over = remaining <= 0 || !current

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer Match" hitSlop={12} onPress={() => router.back()} style={styles.iconBtn}>
          <X size={24} color={colors.paper} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.topTitle}>Match</Text>
          <Text style={styles.topSub} accessibilityLiveRegion="polite">
            {remaining > 0 ? `${remaining} swipe${remaining > 1 ? 's' : ''} aujourd’hui` : 'À demain pour de nouvelles cartes'}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      {over ? (
        <Recap liked={recap} limitReached={remaining <= 0} loggedIn={!!session} onReload={onReload} />
      ) : (
        <>
          <View style={styles.deck}>
            {next ? (
              <View style={[StyleSheet.absoluteFill, styles.under]} pointerEvents="none" importantForAccessibility="no-hide-descendants">
                <SwipeCard key={next.id} event={next} onSwiped={() => {}} fling={null} interactive={false} />
              </View>
            ) : null}
            <SwipeCard key={current.id} event={current} onSwiped={onSwiped} fling={fling} interactive />
          </View>

          {notice ? (
            <Text style={styles.notice} accessibilityRole="alert">
              {notice}
            </Text>
          ) : null}

          {showNudge ? (
            <View style={styles.nudge}>
              <Text style={styles.nudgeText}>Crée ton compte pour garder tes matchs et recevoir un Drop à ton image.</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <Button label="Créer mon compte" kind="light" compact onPress={() => router.push('/connexion')} />
                <Button label="Plus tard" kind="secondary" compact onPress={() => setNudgeDismissed(true)} />
              </View>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Pas pour moi : ${current.title}`}
              onPress={() => press('left')}
              style={({ pressed }) => [styles.round, styles.pass, { opacity: pressed ? 0.8 : 1 }]}>
              <X size={30} color="#ff9a8a" strokeWidth={2.5} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Voir la fiche : ${current.title}`}
              onPress={() => openEvent(current, 'match')}
              style={({ pressed }) => [styles.roundSmall, { opacity: pressed ? 0.8 : 1 }]}>
              <Info size={22} color={colors.paper} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ça me tente : ${current.title}`}
              onPress={() => press('right')}
              style={({ pressed }) => [styles.round, styles.like, { opacity: pressed ? 0.8 : 1 }]}>
              <Heart size={30} color="#7fe0b4" fill="#7fe0b4" />
            </Pressable>
          </View>
        </>
      )}
    </View>
  )
}

function Recap({ liked, limitReached, loggedIn, onReload }: { liked: CardEvent[]; limitReached: boolean; loggedIn: boolean; onReload: () => void }) {
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 24 }}>
      <Text style={styles.recapTitle} accessibilityRole="header">
        {limitReached ? 'C’est tout pour aujourd’hui.' : 'Tu as vu toutes les cartes.'}
      </Text>
      <Text style={styles.recapText}>
        {limitReached
          ? 'Reviens demain pour de nouvelles cartes. Tes choix nourrissent ton Drop du lundi.'
          : 'Tes choix nourrissent ton Drop du lundi. De nouvelles cartes arrivent avec les nouvelles sorties.'}
      </Text>
      {!limitReached ? <Button label="Recharger les cartes" kind="light" compact onPress={onReload} style={{ alignSelf: 'flex-start', marginTop: 14 }} /> : null}
      {!loggedIn ? (
        <Button label="Créer mon compte pour garder mes matchs" kind="light" onPress={() => router.push('/connexion')} style={{ marginTop: 14 }} />
      ) : null}

      <T v="kicker" style={{ color: colors.accentGlow, marginTop: 28 }}>
        Ça te tente
      </T>
      {liked.length ? (
        <View style={styles.likedBox}>
          {liked.map((e) => (
            <EventCard key={e.id} event={e} variant="row" origin="match-recap" />
          ))}
        </View>
      ) : (
        <Text style={styles.recapText}>Rien pour l’instant. Glisse une carte à droite quand une sortie te tente.</Text>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.paper },
  topSub: { fontFamily: fonts.regular, fontSize: 13, color: 'rgba(251,250,247,0.7)', marginTop: 1 },
  deck: { flex: 1, marginHorizontal: GUTTER, marginTop: 10 },
  under: { transform: [{ scale: 0.95 }, { translateY: 14 }], opacity: 0.7 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, marginTop: 16 },
  round: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.nightSoft, borderWidth: 2 },
  pass: { borderColor: 'rgba(255,154,138,0.5)' },
  like: { borderColor: 'rgba(127,224,180,0.5)' },
  roundSmall: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.nightSoft },
  notice: { fontFamily: fonts.medium, fontSize: 13, color: '#ff9a8a', textAlign: 'center', marginTop: 8, paddingHorizontal: GUTTER },
  nudge: { marginHorizontal: GUTTER, marginTop: 12, backgroundColor: colors.nightSoft, borderRadius: radius.lg, padding: 14 },
  nudgeText: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, color: colors.paper },
  recapTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 33, letterSpacing: -0.6, color: colors.paper, marginTop: 20 },
  recapText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: 'rgba(251,250,247,0.82)', marginTop: 10 },
  likedBox: { backgroundColor: colors.paper, borderRadius: radius.lg, paddingHorizontal: 12, marginTop: 10 },
})
