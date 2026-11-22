import { useState } from 'react'
import { Alert, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { Star } from 'lucide-react-native'
import { useReviews, useSendReview } from '@/lib/queries'
import { blockReviewAuthor, hideReview, useLocalState } from '@/lib/local-store'
import { CONTACT_EMAIL } from '@/lib/config'
import { BLOCKED_REVIEW_MESSAGE, containsBlockedWords } from '@/shared'
import { errorMessage } from '@/lib/api'
import { Button, Notice, T } from '@/components/ui'
import { colors, fonts, radius } from '@/theme'

function Stars({ value, onChange, size = 26 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole={onChange ? 'adjustable' : 'image'} accessibilityLabel={`${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} disabled={!onChange} onPress={() => onChange?.(n)} hitSlop={4} accessibilityLabel={`${n} étoile${n > 1 ? 's' : ''}`}>
          <Star size={size} color={n <= value ? colors.gold : colors.borderStrong} fill={n <= value ? colors.gold : 'transparent'} />
        </Pressable>
      ))}
    </View>
  )
}

/**
 * Signaler un avis (e-mail prérempli à l'équipe) ou ne plus voir son auteur
 * (masqué sur ce téléphone). Exigence 1.2 de l'App Store pour le contenu des membres.
 */
function reportReview(eventId: string, review: { id: string; authorKey?: string }) {
  const report = async () => {
    hideReview(review.id)
    const subject = encodeURIComponent('Signalement d’un avis Paname Club')
    const body = encodeURIComponent(`Avis signalé : ${review.id}\nSortie : ${eventId}\n\nPourquoi ? (facultatif)\n`)
    const url = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`
    const ok = await Linking.canOpenURL(url).catch(() => false)
    if (ok) await Linking.openURL(url).catch(() => {})
    Alert.alert('Merci', `L’avis est masqué pour toi. Nous examinons chaque signalement sous 24 heures${ok ? '' : ` : écris-nous à ${CONTACT_EMAIL} si tu veux en dire plus`}.`)
  }
  Alert.alert('Cet avis pose problème ?', undefined, [
    { text: 'Signaler cet avis', onPress: report },
    {
      text: 'Ne plus voir ce membre',
      onPress: () => {
        if (review.authorKey) blockReviewAuthor(review.authorKey)
        hideReview(review.id)
      },
    },
    { text: 'Annuler', style: 'cancel' },
  ])
}

/** Avis des membres : seulement une fois la sortie commencée (comme sur le site). */
export function Reviews({ eventId }: { eventId: string }) {
  const q = useReviews(eventId)
  const send = useSendReview(eventId)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [blockedWords, setBlockedWords] = useState(false)
  const hidden = useLocalState((s) => s.hiddenReviews)
  const blocked = useLocalState((s) => s.blockedAuthors)
  const data = q.data
  if (!data || (!data.canReview && data.stats.totalReviews === 0)) return null
  const mine = data.userReview
  return (
    <View style={{ marginTop: 28 }}>
      <T v="kicker">Les membres en parlent</T>
      <View style={styles.head}>
        <T v="h2">Avis</T>
        {data.stats.avgRating != null ? (
          <T v="bodyStrong">
            {String(data.stats.avgRating).replace('.', ',')} / 5 · {data.stats.totalReviews} avis
          </T>
        ) : null}
      </View>
      {data.canReview ? (
        data.loggedIn ? (
          <View style={styles.form}>
            <T v="label">{mine ? 'Ton avis' : 'Tu y étais ? Donne ta note'}</T>
            <Stars value={rating || mine?.rating || 0} onChange={setRating} />
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder={mine?.comment ?? 'Un mot pour les autres membres (facultatif)'}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
              style={styles.input}
              accessibilityLabel="Commentaire"
            />
            {blockedWords ? <Notice text={BLOCKED_REVIEW_MESSAGE} tone="error" /> : null}
            {send.isError && !blockedWords ? <Notice text={errorMessage(send.error)} tone="error" /> : null}
            <Button
              label={mine ? 'Mettre à jour' : 'Publier'}
              compact
              disabled={!(rating || mine?.rating)}
              loading={send.isPending}
              onPress={() => {
                const text = comment || mine?.comment || null
                if (containsBlockedWords(text)) return setBlockedWords(true)
                setBlockedWords(false)
                send.mutate({ rating: rating || mine!.rating, comment: text })
              }}
            />
          </View>
        ) : (
          <Button label="Me connecter pour noter" kind="secondary" compact onPress={() => router.push('/connexion')} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
        )
      ) : null}
      {data.reviews
        .filter((r) => !hidden.includes(r.id) && !(r.authorKey && blocked.includes(r.authorKey)))
        .slice(0, 10)
        .map((r) => (
        <View key={r.id} style={styles.review}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Stars value={r.rating} size={14} />
            <T v="caption" style={{ flex: 1 }}>{r.userName ?? 'Un membre'}</T>
            <Pressable onPress={() => reportReview(eventId, r)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Signaler cet avis ou masquer ce membre">
              <T v="caption" style={{ color: colors.textMuted, textDecorationLine: 'underline' }}>Signaler</T>
            </Pressable>
          </View>
          {r.comment ? <T v="small" style={{ marginTop: 4, color: colors.ink }}>{r.comment}</T> : null}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 2, marginBottom: 8 },
  form: { gap: 10, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  input: {
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  review: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
})
