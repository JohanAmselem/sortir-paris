/**
 * Réglages : notifications et alertes, compte (déconnexion, suppression
 * définitive, exigée par Apple et Google), confidentialité, contact.
 */
import { useEffect, useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { router } from 'expo-router'
import * as Application from 'expo-application'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronRight } from 'lucide-react-native'
import { useAuth } from '@/lib/auth'
import { useMe, useUpdateAlerts } from '@/lib/queries'
import { enablePush, pushStatus, type PushStatus } from '@/lib/push'
import { openWeb } from '@/lib/actions'
import { errorMessage } from '@/lib/api'
import { CONTACT_EMAIL } from '@/lib/config'
import { clearHiddenReviews, useLocalState } from '@/lib/local-store'
import { Button, Notice, T } from '@/components/ui'
import { colors, fonts, GUTTER, radius } from '@/theme'

type AlertKey = 'pushEnabled' | 'emailEnabled' | 'notifyNewDate' | 'notifyOnSale' | 'notifyReminder' | 'notifyDrop'

const TOGGLES: Array<{ key: AlertKey; label: string; hint: string }> = [
  { key: 'pushEnabled', label: 'Notifications sur ce téléphone', hint: 'Les alertes arrivent ici' },
  { key: 'emailEnabled', label: 'Alertes par e-mail', hint: 'Un e-mail groupé, désinscription en un clic' },
  { key: 'notifyNewDate', label: 'Nouvelle date', hint: 'Un artiste suivi annonce une date à Paris' },
  { key: 'notifyOnSale', label: 'Ouverture de la billetterie', hint: 'Pour ne pas rater les places' },
  { key: 'notifyReminder', label: 'Rappel la veille', hint: 'Pour tes « J’y vais »' },
  { key: 'notifyDrop', label: 'Le Drop du lundi', hint: 'Tes 5 idées de la semaine, le lundi matin' },
]

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 28 }}>
      <T v="kicker" style={{ paddingHorizontal: GUTTER, marginBottom: 8 }}>
        {title}
      </T>
      <View style={styles.group}>{children}</View>
    </View>
  )
}

function LinkRow({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
      <Text style={[styles.label, danger && { color: colors.error }]}>{label}</Text>
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
  )
}

export default function Reglages() {
  const insets = useSafeAreaInsets()
  const auth = useAuth()
  const me = useMe()
  const update = useUpdateAlerts()
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const hiddenCount = useLocalState((st) => st.hiddenReviews.length + st.blockedAuthors.length)

  useEffect(() => {
    pushStatus().then(setStatus)
  }, [])

  const alerts = me.data?.alerts
  const turnOnPush = async () => {
    setBusy(true)
    try {
      setStatus(await enablePush())
      me.refetch()
    } catch (err) {
      Alert.alert('Notifications', errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = () => {
    Alert.alert(
      'Supprimer ton compte ?',
      'Ton compte et toutes tes données (sorties gardées, suivis, alertes, Club, avis) seront supprimés définitivement. Ce n’est pas réversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer définitivement',
          style: 'destructive',
          onPress: async () => {
            try {
              await auth.deleteAccount()
              Alert.alert('Compte supprimé', 'Ton compte et tes données ont été supprimés.')
              router.replace('/')
            } catch (err) {
              Alert.alert('Suppression impossible', errorMessage(err))
            }
          },
        },
      ]
    )
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
      {auth.session ? (
        <>
          <Group title="Notifications">
            {status === 'granted' ? null : (
              <View style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
                <T v="small">
                  {status === 'denied'
                    ? 'Les notifications de Paname Club sont coupées dans les Réglages du téléphone.'
                    : status === 'unavailable'
                      ? 'Les notifications ne sont pas disponibles sur cet appareil.'
                      : 'Active les notifications pour recevoir tes alertes concerts et ton Drop du lundi.'}
                </T>
                {status === 'denied' ? (
                  <Button label="Ouvrir les Réglages" kind="secondary" compact onPress={() => Linking.openSettings()} />
                ) : status === 'undetermined' ? (
                  <Button label="Activer les notifications" compact loading={busy} onPress={turnOnPush} />
                ) : null}
              </View>
            )}
            {alerts
              ? TOGGLES.map((t) => (
                  <View key={t.key} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>{t.label}</Text>
                      <Text style={styles.hint}>{t.hint}</Text>
                    </View>
                    <Switch
                      value={alerts[t.key]}
                      onValueChange={(value) => update.mutate({ [t.key]: value })}
                      trackColor={{ true: colors.accent, false: colors.border }}
                      accessibilityLabel={t.label}
                    />
                  </View>
                ))
              : null}
            {update.isError ? <Notice text={errorMessage(update.error)} tone="error" /> : null}
          </Group>

          <Group title="Compte">
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{me.data?.email ?? auth.session.user.email}</Text>
                <Text style={styles.hint}>
                  Connecté avec{' '}
                  {(me.data?.providers ?? []).map((p) => (p === 'apple' ? 'Apple' : p === 'google' ? 'Google' : 'e-mail')).join(', ') || 'e-mail'}
                </Text>
              </View>
            </View>
            <LinkRow label="Se déconnecter" onPress={() => auth.signOut().then(() => router.replace('/'))} />
            <LinkRow label="Supprimer mon compte" danger onPress={confirmDelete} />
          </Group>
        </>
      ) : (
        <View style={{ paddingHorizontal: GUTTER, paddingTop: 20 }}>
          <T v="small">Connecte-toi pour régler tes alertes et tes notifications.</T>
          <Button label="Me connecter" style={{ marginTop: 12, alignSelf: 'flex-start' }} compact onPress={() => router.push('/connexion')} />
        </View>
      )}

      <Group title="À propos">
        <LinkRow label="Politique de confidentialité" onPress={() => openWeb('https://www.panameclub.fr/confidentialite')} />
        <LinkRow label="Mentions légales" onPress={() => openWeb('https://www.panameclub.fr/mentions-legales')} />
        <LinkRow label="Nous écrire" onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} />
        {hiddenCount > 0 ? (
          <LinkRow
            label={`Réafficher les avis masqués (${hiddenCount})`}
            onPress={() => Alert.alert('Réafficher les avis masqués ?', 'Les avis et les membres que tu as masqués réapparaîtront.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Réafficher', onPress: clearHiddenReviews }])}
          />
        ) : null}
        {!auth.session ? <LinkRow label="Supprimer un compte" onPress={() => openWeb('https://www.panameclub.fr/suppression-compte')} /> : null}
      </Group>

      <T v="caption" style={{ textAlign: 'center', marginTop: 24 }}>
        Paname Club {Application.nativeApplicationVersion ?? ''} · édité par JUNO
      </T>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  group: { marginHorizontal: GUTTER, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  label: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink, flex: 1 },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, marginTop: 1 },
})
