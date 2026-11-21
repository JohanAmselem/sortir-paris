import { useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { Star } from 'lucide-react-native'
import { useReviews, useSendReview } from '@/lib/queries'
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

/** Avis des membres : seulement une fois la sortie commencée (comme sur le site). */
export function Reviews({ eventId }: { eventId: string }) {
  const q = useReviews(eventId)
  const send = useSendReview(eventId)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
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
            {send.isError ? <Notice text={errorMessage(send.error)} tone="error" /> : null}
            <Button
              label={mine ? 'Mettre à jour' : 'Publier'}
              compact
              disabled={!(rating || mine?.rating)}
              loading={send.isPending}
              onPress={() => send.mutate({ rating: rating || mine!.rating, comment: comment || mine?.comment || null })}
            />
          </View>
        ) : (
          <Button label="Me connecter pour noter" kind="secondary" compact onPress={() => router.push('/connexion')} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
        )
      ) : null}
      {data.reviews.slice(0, 10).map((r) => (
        <View key={r.id} style={styles.review}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Stars value={r.rating} size={14} />
            <T v="caption">{r.userName ?? 'Un membre'}</T>
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
