/**
 * « Je veux sortir… » : la même entrée que l'accueil du site
 * (apps/web/src/components/home/discover.tsx). Pastilles → GET /api/discover
 * (en cache), phrase libre → POST (IA, repli sur des règles), résultats sur place.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { ArrowRight, LocateFixed, Sparkles, X } from 'lucide-react-native'
import { buildEventParams, type CardEvent } from '@/shared'
import { Chip, Notice, T } from '@/components/ui'
import { EventCard } from '@/components/EventCard'
import { discover } from '@/lib/queries'
import { locate, locateMessage, type Coords } from '@/lib/location'
import { errorMessage } from '@/lib/api'
import { track } from '@/lib/analytics'
import type { Recommendation } from '@/lib/types'
import { colors, fonts, GUTTER, radius } from '@/theme'

type When = 'now' | 'tonight' | 'tomorrow' | 'weekend'
type Extra = 'free' | 'budget' | 'insolite' | 'near'

const WHEN: Array<{ id: When; label: string }> = [
  { id: 'now', label: 'maintenant' },
  { id: 'tonight', label: 'ce soir' },
  { id: 'tomorrow', label: 'demain' },
  { id: 'weekend', label: 'ce week-end' },
]
const WITH = [
  { id: 'en-amoureux', label: 'à deux' },
  { id: 'entre-amis', label: 'entre amis' },
  { id: 'en-famille', label: 'en famille' },
]
const EXTRAS: Array<{ id: Extra; label: string }> = [
  { id: 'free', label: 'gratuit' },
  { id: 'budget', label: 'moins de 20 €' },
  { id: 'insolite', label: 'original' },
  { id: 'near', label: 'près de moi' },
]

export function Discover({ initial }: { initial: { events: CardEvent[]; relaxed: string | null } | undefined }) {
  const [when, setWhen] = useState<When>('tonight')
  const [withWho, setWithWho] = useState<string | null>(null)
  const [extras, setExtras] = useState<Set<Extra>>(new Set())
  const [text, setText] = useState('')
  const [coords, setCoords] = useState<Coords | null>(null)
  const [result, setResult] = useState<Pick<Recommendation, 'events' | 'relaxed'> & { query?: Recommendation['query'] } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const first = useRef(true)
  const seq = useRef(0)

  const run = useCallback(async (input: Parameters<typeof discover>[0]) => {
    const id = ++seq.current
    setPending(true)
    setError(null)
    try {
      const r = await discover(input)
      if (id === seq.current) setResult(r)
    } catch (err) {
      if (id === seq.current) setError(errorMessage(err))
    } finally {
      if (id === seq.current) setPending(false)
    }
  }, [])

  // Pastilles → requête (pas au premier affichage : l'accueil a déjà les idées de ce soir).
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (text) return
    if (extras.has('near') && !coords) return
    const params = new URLSearchParams({ when, limit: '4' })
    const intents = [withWho, extras.has('insolite') ? 'insolite' : null].filter(Boolean) as string[]
    if (intents.length) params.set('intents', intents.join(','))
    if (extras.has('free')) params.set('free', 'true')
    if (extras.has('budget')) params.set('maxPrice', '20')
    if (extras.has('near') && coords) {
      params.set('lat', coords.lat.toFixed(3))
      params.set('lng', coords.lng.toFixed(3))
    }
    run({ params })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [when, withWho, extras, coords])

  const toggleExtra = async (id: Extra) => {
    setText('')
    track('intent_chip', { chip: id })
    if (id === 'near' && !extras.has('near') && !coords) {
      const r = await locate()
      if (!r.ok) {
        setError(locateMessage(r.reason))
        return
      }
      setCoords(r.coords)
    }
    setExtras((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const submitText = () => {
    const q = text.trim()
    if (q.length < 2) return
    run({ text: q, coords })
  }

  const shown = result ?? (initial ? { events: initial.events, relaxed: initial.relaxed } : null)
  const seeAll = () => {
    const q = result?.query
    const params = q ? buildEventParams({ ...q, near: q.near ?? null }).toString() : buildEventParams({ when }).toString()
    router.push({ pathname: '/liste', params: { params, title: 'Tes idées de sortie' } })
  }

  return (
    <View style={styles.hero}>
      <Text style={styles.h1} accessibilityRole="header">
        Je veux sortir…
      </Text>
      <View style={styles.chips} accessibilityLabel="Quand ?">
        {WHEN.map((w) => (
          <Chip key={w.id} dark label={w.label} active={!text && when === w.id} onPress={() => (setText(''), setWhen(w.id), track('intent_chip', { chip: w.id }))} />
        ))}
      </View>
      <View style={[styles.chips, { marginTop: 8 }]} accessibilityLabel="Avec qui, comment ?">
        {WITH.map((w) => (
          <Chip
            key={w.id}
            dark
            label={w.label}
            active={!text && withWho === w.id}
            onPress={() => {
              setText('')
              setWithWho((cur) => (cur === w.id ? null : w.id))
              track('intent_chip', { chip: w.id })
            }}
          />
        ))}
        {EXTRAS.map((x) => (
          <Chip
            key={x.id}
            dark
            label={x.label}
            active={!text && extras.has(x.id)}
            icon={x.id === 'near' ? <LocateFixed size={14} color={!text && extras.has(x.id) ? colors.ink : colors.paper} /> : undefined}
            onPress={() => toggleExtra(x.id)}
          />
        ))}
      </View>

      <View style={styles.askLabel}>
        <Sparkles size={15} color={colors.accentGlow} />
        <Text style={styles.askLabelText}>ou dis-le avec tes mots</Text>
      </View>
      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={submitText}
          placeholder="un concert pas cher dans le 11e pour deux…"
          placeholderTextColor="rgba(251,250,247,0.45)"
          returnKeyType="search"
          maxLength={200}
          style={styles.input}
          accessibilityLabel="Décris ta sortie"
        />
        {text ? (
          <Pressable onPress={() => setText('')} accessibilityLabel="Effacer" hitSlop={8} style={styles.clear}>
            <X size={18} color="rgba(251,250,247,0.7)" />
          </Pressable>
        ) : null}
        <Pressable
          onPress={submitText}
          disabled={pending || text.trim().length < 2}
          accessibilityRole="button"
          accessibilityLabel="Trouver"
          style={({ pressed }) => [styles.go, { opacity: text.trim().length < 2 ? 0.5 : pressed ? 0.8 : 1 }]}>
          {pending ? <ActivityIndicator color={colors.paper} size="small" /> : <ArrowRight size={20} color={colors.paper} />}
        </Pressable>
      </View>

      <View style={styles.results}>
        {error ? <Notice text={error} tone="warning" /> : null}
        {shown?.relaxed ? <Text style={styles.relaxed}>{shown.relaxed}</Text> : null}
        {shown && shown.events.length === 0 && !pending ? (
          <T v="small" style={{ color: 'rgba(251,250,247,0.75)', marginTop: 8 }}>
            Rien de tel pour l’instant. Essaie un autre moment ou retire un filtre.
          </T>
        ) : null}
        {shown?.events.map((e) => (
          <View key={e.id} style={styles.resultCard}>
            <EventCard event={e} variant="row" origin="discover" />
          </View>
        ))}
        {shown && shown.events.length > 0 ? (
          <Pressable onPress={seeAll} accessibilityRole="link" style={styles.seeAll}>
            <Text style={styles.seeAllText}>Voir toutes les idées</Text>
            <ArrowRight size={16} color={colors.accentGlow} />
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.night, paddingHorizontal: GUTTER, paddingBottom: 24 },
  h1: { fontFamily: fonts.display, fontSize: 46, lineHeight: 44, letterSpacing: -1.2, color: colors.paper, marginTop: 8, marginBottom: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  askLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, marginBottom: 8 },
  askLabelText: { fontFamily: fonts.regular, fontSize: 14, color: 'rgba(251,250,247,0.8)' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(251,250,247,0.2)',
    backgroundColor: 'rgba(251,250,247,0.06)',
    padding: 5,
  },
  input: { flex: 1, minHeight: 44, paddingHorizontal: 10, fontFamily: fonts.regular, fontSize: 16, color: colors.paper },
  clear: { padding: 6 },
  go: { width: 46, height: 44, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  results: { marginTop: 16 },
  resultCard: { backgroundColor: colors.paper, borderRadius: radius.lg, paddingHorizontal: 12, marginBottom: 8 },
  relaxed: { fontFamily: fonts.regular, fontSize: 13, color: colors.accentGlow, marginBottom: 8 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, alignSelf: 'flex-start', paddingVertical: 6 },
  seeAllText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accentGlow },
})
