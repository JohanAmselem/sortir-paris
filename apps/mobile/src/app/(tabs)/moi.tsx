/**
 * Onglet « Moi » : mes sorties (gardées et « J'y vais », par date, disponibles
 * hors connexion), mes artistes et lieux, réglages. Sans compte : ce qui est
 * gardé sur le téléphone, et l'invitation à rejoindre le Club.
 */
import { useMemo, useState } from 'react'
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Bell, ChevronRight, Dna, Settings, Sparkles, Users } from 'lucide-react-native'
import type { CardEvent } from '@/shared'
import { useAuth } from '@/lib/auth'
import { useMe } from '@/lib/queries'
import { useLocalState } from '@/lib/local-store'
import { errorMessage } from '@/lib/api'
import { CONTACT_EMAIL } from '@/lib/config'
import { EventCard } from '@/components/EventCard'
import { Button, Card, Chip, EmptyState, Notice, T } from '@/components/ui'
import { colors, fonts, GUTTER, radius } from '@/theme'
import { StatusBarBackdrop } from '@/components/StatusBarBackdrop'

function Row({ icon, label, hint, onPress, badge }: { icon: React.ReactNode; label: string; hint?: string; onPress: () => void; badge?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
  )
}

function byDate(list: CardEvent[]) {
  return [...list].sort((a, b) => a.startDate.localeCompare(b.startDate))
}

export default function Moi() {
  const insets = useSafeAreaInsets()
  const { session } = useAuth()
  const me = useMe()
  const localSaves = useLocalState((s) => s.saves)
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')

  const upcoming = useMemo(() => {
    if (!me.data) return []
    // Gardées + « J'y vais », une seule fois chacune, par date.
    const merged = new Map<string, CardEvent>()
    for (const e of me.data.saved.upcoming) merged.set(e.id, e)
    for (const e of me.data.attending) merged.set(e.id, { ...e, reason: 'J’y vais' })
    return byDate([...merged.values()])
  }, [me.data])

  const localList = useMemo(() => byDate(Object.values(localSaves).map((s) => s.event)), [localSaves])

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <ScrollView
      contentInsetAdjustmentBehavior="never"
      style={{ flex: 1, backgroundColor: colors.paper }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }}
      refreshControl={session ? <RefreshControl refreshing={me.isRefetching} onRefresh={() => void me.refetch()} /> : undefined}>
      <View style={{ paddingHorizontal: GUTTER }}>
        <T v="kicker">{session ? 'Membre du Club' : 'Paname Club'}</T>
        <T v="h1" accessibilityRole="header" style={{ marginTop: 2 }}>
          {session ? (me.data?.name ? `Salut ${me.data.name.split(/\s+/)[0]}` : 'Mes sorties') : 'Mes sorties'}
        </T>
        {session && me.data?.email ? <T v="caption" style={{ marginTop: 4 }}>{me.data.email}</T> : null}
      </View>

      {!session ? (
        <View style={{ paddingHorizontal: GUTTER, marginTop: 18 }}>
          <Card style={{ backgroundColor: colors.night, borderColor: colors.night }}>
            <T v="h2" style={{ color: colors.paper }}>
              Rejoins le Club
            </T>
            <T v="small" style={{ color: 'rgba(251,250,247,0.8)', marginTop: 6 }}>
              Tes sorties sur tous tes appareils, des alertes quand tes artistes passent à Paris, et ton Drop du lundi.
            </T>
            <Button label="Créer mon compte ou me connecter" kind="light" style={{ marginTop: 14 }} onPress={() => router.push('/connexion')} />
          </Card>
          <T v="h2" style={{ marginTop: 28 }}>
            Gardées sur ce téléphone
          </T>
          {localList.length ? (
            localList.map((e) => <EventCard key={e.id} event={e} variant="row" origin="moi" />)
          ) : (
            <EmptyState title="Rien de gardé pour l’instant" text="Touche le marque-page d’une sortie pour la retrouver ici, même sans réseau." />
          )}
        </View>
      ) : (
        <View style={{ marginTop: 18 }}>
          {me.isError && !me.data ? <Notice text={errorMessage(me.error)} tone="error" /> : null}
          {me.isError && me.data ? <Notice text="Hors connexion : tes sorties telles que chargées la dernière fois." tone="warning" /> : null}
          <View style={styles.tabs} accessibilityRole="tablist">
            <Chip label={`À venir${me.data ? ` · ${upcoming.length}` : ''}`} active={tab === 'upcoming'} onPress={() => setTab('upcoming')} />
            <Chip label={`Passées${me.data ? ` · ${me.data.saved.past.length}` : ''}`} active={tab === 'past'} onPress={() => setTab('past')} />
          </View>
          <View style={{ paddingHorizontal: GUTTER }}>
            {(tab === 'upcoming' ? upcoming : (me.data?.saved.past ?? [])).map((e) => (
              <EventCard key={e.id} event={e} variant="row" origin="moi" />
            ))}
            {me.data && (tab === 'upcoming' ? upcoming : me.data.saved.past).length === 0 ? (
              <EmptyState
                title={tab === 'upcoming' ? 'Aucune sortie prévue' : 'Pas encore de sortie passée'}
                text={tab === 'upcoming' ? 'Garde une sortie ou dis « J’y vais » : elle s’affiche ici, par date.' : undefined}
                action={tab === 'upcoming' ? <Button label="Voir ce soir" compact kind="secondary" onPress={() => router.navigate('/')} /> : undefined}
              />
            ) : null}
          </View>
        </View>
      )}

      <View style={[styles.list, { marginTop: 28 }]}>
        {session ? (
          <Row
            icon={<Bell size={20} color={colors.accent} />}
            label="Mes artistes et lieux"
            hint="Alertes concerts, nouveautés"
            badge={me.data?.newForYou || undefined}
            onPress={() => router.push('/compte/artistes')}
          />
        ) : null}
        <Row icon={<Sparkles size={20} color={colors.accent} />} label="Le Club" hint="Drop, Match, quiz, défis" onPress={() => router.navigate('/club')} />
        {session ? <Row icon={<Dna size={20} color={colors.accent} />} label="Mon ADN culturel" onPress={() => router.push('/adn')} /> : null}
        <Row icon={<Settings size={20} color={colors.accent} />} label="Réglages" hint={session ? 'Notifications, compte, confidentialité' : 'Confidentialité, à propos'} onPress={() => router.push('/reglages')} />
        <Row icon={<Users size={20} color={colors.accent} />} label="Nous écrire" hint={CONTACT_EMAIL} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} />
      </View>
    </ScrollView>
    <StatusBarBackdrop color={colors.paper} />
    </View>
  )
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: GUTTER, marginBottom: 4 },
  list: { marginHorizontal: GUTTER, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLabel: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  rowHint: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontFamily: fonts.bold, fontSize: 12, color: colors.paper },
})
