/**
 * Onglet « Mes sorties » : les sorties gardées et « J'y vais », rangées par date
 * comme des billets (disponibles hors connexion), mes artistes et leurs
 * nouvelles dates, et l'accès au compte. Sans compte : ce qui est gardé sur le
 * téléphone, et la connexion proposée en une ligne.
 */
import { useMemo, useState } from 'react'
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { Bell, ChevronRight, Mail, Settings, UserRound } from 'lucide-react-native'
import { formatMonthLong, parisISODate, type CardEvent } from '@/shared'
import { useAuth } from '@/lib/auth'
import { useMe } from '@/lib/queries'
import { useLocalState } from '@/lib/local-store'
import { errorMessage } from '@/lib/api'
import { CONTACT_EMAIL } from '@/lib/config'
import { EventCard } from '@/components/EventCard'
import { Button, Chip, EmptyState, IconButton, Notice, Segmented, T } from '@/components/ui'
import { colors, fonts, GUTTER, radius } from '@/theme'
import { StatusBarBackdrop } from '@/components/StatusBarBackdrop'

type Tagged = CardEvent & { tag?: string }

const nightDay = (d: Date) => parisISODate(new Date(d.getTime() - 4 * 3600_000))

/** « Aujourd’hui », « Demain », « Cette semaine », puis le mois (« Mars 2027 »). */
export function bucketOf(e: CardEvent, now = new Date()): string {
  const start = new Date(e.startDate)
  const today = nightDay(now)
  const day = start < now ? today : nightDay(start)
  const diff = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400_000)
  if (diff <= 0) return 'Aujourd’hui'
  if (diff === 1) return 'Demain'
  if (diff < 7) return 'Cette semaine'
  const m = formatMonthLong(day.slice(0, 7), now)
  return m.charAt(0).toUpperCase() + m.slice(1)
}

function groupTickets(list: Tagged[], now = new Date()): Array<{ title: string; items: Tagged[] }> {
  const out: Array<{ title: string; items: Tagged[] }> = []
  for (const e of [...list].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const title = bucketOf(e, now)
    const g = out.at(-1)
    if (g && g.title === title) g.items.push(e)
    else out.push({ title, items: [e] })
  }
  return out
}

function Row({ icon, label, hint, onPress }: { icon: React.ReactNode; label: string; hint?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  )
}

export default function MesSorties() {
  const { session } = useAuth()
  const me = useMe()
  const localSaves = useLocalState((s) => s.saves)
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [now] = useState(() => Date.now())

  const { upcoming, past } = useMemo(() => {
    if (!session) {
      const all = Object.values(localSaves).map((s) => ({ ...s.event, tag: 'Gardée' }))
      const ended = (e: CardEvent) => new Date(e.endDate ?? e.startDate).getTime() + 2 * 3600_000 < now
      return { upcoming: all.filter((e) => !ended(e)), past: all.filter(ended) }
    }
    if (!me.data) return { upcoming: [] as Tagged[], past: [] as Tagged[] }
    const merged = new Map<string, Tagged>()
    for (const e of me.data.saved.upcoming) merged.set(e.id, { ...e, tag: 'Gardée' })
    for (const e of me.data.attending) merged.set(e.id, { ...e, tag: 'J’y vais' })
    return { upcoming: [...merged.values()], past: me.data.saved.past.map((e) => ({ ...e, tag: 'Gardée' })) }
  }, [session, me.data, localSaves, now])

  const list = tab === 'upcoming' ? upcoming : past
  const groups = useMemo(() => (tab === 'upcoming' ? groupTickets(list) : [{ title: 'Passées', items: [...list].sort((a, b) => b.startDate.localeCompare(a.startDate)) }]), [list, tab])
  const artists = (me.data?.follows ?? []).filter((f) => f.kind === 'artist')
  const newForYou = me.data?.newForYou ?? 0

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={session ? <RefreshControl tintColor={colors.muted} refreshing={me.isRefetching} onRefresh={() => void me.refetch()} /> : undefined}>
        <View style={styles.top}>
          <T v="title1" accessibilityRole="header">
            Mes sorties
          </T>
          <IconButton label={session ? 'Mon compte et mes réglages' : 'Se connecter, réglages'} onPress={() => router.push('/reglages')}>
            <UserRound size={19} color={colors.text2} />
          </IconButton>
        </View>

        <View style={{ paddingHorizontal: GUTTER, marginTop: 16 }}>
          <Segmented
            options={[
              { key: 'upcoming', label: `À venir${upcoming.length ? ` · ${upcoming.length}` : ''}` },
              { key: 'past', label: 'Passées' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>

        {session && me.isError && !me.data ? <View style={{ marginTop: 14 }}><Notice text={errorMessage(me.error)} tone="error" /></View> : null}
        {session && me.isError && me.data ? <View style={{ marginTop: 14 }}><Notice text="Hors connexion : tes sorties telles que chargées la dernière fois." tone="warning" /></View> : null}

        {list.length ? (
          groups.map((g) => (
            <View key={g.title}>
              <T v="micro" style={styles.groupTitle}>
                {g.title}
              </T>
              <View style={{ paddingHorizontal: GUTTER, gap: 10 }}>
                {g.items.map((e) => (
                  <EventCard key={e.id} event={e} variant="ticket" tag={e.tag} origin="mes-sorties" />
                ))}
              </View>
            </View>
          ))
        ) : session && me.isLoading ? null : (
          <EmptyState
            title={tab === 'upcoming' ? 'Aucune sortie prévue' : 'Pas encore de sortie passée'}
            text={tab === 'upcoming' ? 'Touche le marque-page d’une sortie : elle s’affiche ici, par date, même sans réseau.' : undefined}
            action={tab === 'upcoming' ? <Button label="Voir ce soir" compact kind="secondary" onPress={() => router.navigate('/')} /> : undefined}
          />
        )}

        <View style={{ marginTop: 32 }}>
          <View style={styles.sectionHead}>
            <T v="title2">Mes artistes</T>
            {session ? (
              <Pressable accessibilityRole="link" hitSlop={12} onPress={() => router.push('/compte/artistes')}>
                <Text style={styles.link}>Gérer</Text>
              </Pressable>
            ) : null}
          </View>
          {newForYou > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/compte/artistes')} style={styles.news}>
              <Bell size={18} color={colors.accent} />
              <Text style={styles.newsText}>
                {newForYou} nouvelle{newForYou > 1 ? 's dates' : ' date'} pour tes artistes
              </Text>
              <ChevronRight size={18} color={colors.accent} />
            </Pressable>
          ) : null}
          {artists.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 8, marginTop: 12 }}>
              {artists.map((a) => (
                <Chip key={a.id} small label={a.label} onPress={() => router.navigate({ pathname: '/agenda', params: { p: `q=${encodeURIComponent(a.label)}` } })} />
              ))}
            </ScrollView>
          ) : (
            <T v="small" style={{ paddingHorizontal: GUTTER, marginTop: 8 }}>
              Suis tes artistes : une notification dès qu’ils annoncent une date à Paris.
            </T>
          )}
          <Button
            label={artists.length ? 'Ajouter un artiste' : 'Choisir mes artistes'}
            kind="secondary"
            compact
            style={{ alignSelf: 'flex-start', marginHorizontal: GUTTER, marginTop: 14 }}
            onPress={() => (session ? router.push('/compte/artistes') : router.push({ pathname: '/connexion', params: { raison: 'alertes' } }))}
          />
        </View>

        {!session ? (
          <View style={styles.login}>
            <View style={{ flex: 1 }}>
              <Text style={styles.loginTitle}>Garde tout sur ton compte</Text>
              <T v="small">Tes sorties sur le site et sur un autre téléphone.</T>
            </View>
            <Button label="Se connecter" kind="light" compact onPress={() => router.push('/connexion')} />
          </View>
        ) : null}

        <View style={styles.list}>
          <Row icon={<Settings size={20} color={colors.accent} />} label="Compte et réglages" hint={session ? 'Notifications, confidentialité, compte' : 'Confidentialité, à propos'} onPress={() => router.push('/reglages')} />
          <Row icon={<Mail size={20} color={colors.accent} />} label="Nous écrire" hint={CONTACT_EMAIL} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} />
        </View>
      </ScrollView>
      <StatusBarBackdrop color={colors.bg} />
    </View>
  )
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, paddingTop: 6 },
  groupTitle: { paddingHorizontal: GUTTER, marginTop: 22, marginBottom: 10, color: colors.muted },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: GUTTER },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accent },
  news: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: GUTTER, marginTop: 12, padding: 12, borderRadius: radius.lg, backgroundColor: colors.accentSoft },
  newsText: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  login: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: GUTTER, marginTop: 28, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  loginTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text, marginBottom: 2 },
  list: { marginHorizontal: GUTTER, marginTop: 28, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 60, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowLabel: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  rowHint: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, marginTop: 1 },
})
