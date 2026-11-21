/**
 * Quiz « Tu préfères » : 10 questions rapides (2 minutes), puis jusqu'à 40 pour
 * affiner. Mêmes questions et même calcul que le site (taste-quiz-data.ts).
 * Sans compte : le profil est gardé sur le téléphone et repris à la connexion.
 */
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { ChevronLeft, X } from 'lucide-react-native'
import { ARCHETYPES, MIN_ANSWERS, QUICK_QUESTION_IDS, QUIZ_CATEGORIES, QUIZ_QUESTIONS, scoreQuiz, type QuizAnswers, type QuizQuestion } from '@/shared'
import { useSession } from '@/lib/auth'
import { useTasteQuiz } from '@/lib/queries'
import { useLocalState } from '@/lib/local-store'
import { useSubmitQuiz } from '@/lib/club'
import { errorMessage } from '@/lib/api'
import { track } from '@/lib/analytics'
import { Button, Loading, Notice, T } from '@/components/ui'
import { ProgressBar } from '@/components/club/parts'
import { DimensionBars } from '@/components/club/DimensionBars'
import { colors, fonts, GUTTER, radius } from '@/theme'
import { useStatusBar } from '@/lib/status-bar'

const BY_ID = new Map(QUIZ_QUESTIONS.map((q) => [q.id, q]))
const QUICK = QUICK_QUESTION_IDS.map((id) => BY_ID.get(id)).filter((q): q is QuizQuestion => !!q)
const ALL_ORDERED = [...QUICK, ...QUIZ_QUESTIONS.filter((q) => !QUICK_QUESTION_IDS.includes(q.id))]
const TOTAL = QUIZ_QUESTIONS.length
const CATEGORY_TITLE = new Map(QUIZ_CATEGORIES.map((c) => [c.id, c.title]))

type Phase = 'intro' | 'play' | 'result'

export default function QuizScreen() {
  useStatusBar('light')
  const session = useSession()
  const remote = useTasteQuiz()
  const local = useLocalState((s) => s.quiz)
  if (session && remote.isPending) return <Loading label="On retrouve tes réponses…" />
  const initial: QuizAnswers = session ? (remote.data?.answers ?? {}) : (local?.answers ?? {})
  const completed = session ? Boolean(remote.data?.completed) : Boolean(local?.completedAt)
  return <Quiz initialAnswers={initial} initiallyCompleted={completed} />
}

function Quiz({ initialAnswers, initiallyCompleted }: { initialAnswers: QuizAnswers; initiallyCompleted: boolean }) {
  const insets = useSafeAreaInsets()
  const session = useSession()
  const submit = useSubmitQuiz()
  const [answers, setAnswers] = useState<QuizAnswers>(initialAnswers)
  const [phase, setPhase] = useState<Phase>(initiallyCompleted && scoreQuiz(initialAnswers).answered >= MIN_ANSWERS ? 'result' : 'intro')
  const [queue, setQueue] = useState<QuizQuestion[]>([])
  const [pos, setPos] = useState(0)

  const answered = useMemo(() => Object.keys(answers).length, [answers])
  const result = useMemo(() => scoreQuiz(answers), [answers])

  const startRun = (mode: 'quick' | 'more' | 'restart') => {
    track('quiz_start', { mode })
    if (mode === 'restart') {
      setAnswers({})
      setQueue(QUICK)
    } else if (mode === 'quick') {
      const todo = QUICK.filter((q) => !answers[q.id])
      setQueue(todo.length ? todo : QUICK)
    } else {
      setQueue(ALL_ORDERED.filter((q) => !answers[q.id]))
    }
    setPos(0)
    setPhase('play')
  }

  const finish = (final: QuizAnswers) => {
    const done = scoreQuiz(final).answered >= MIN_ANSWERS
    if (done) submit.mutate({ answers: final, completed: true })
    setPhase('result')
  }

  const choose = (q: QuizQuestion, choice: 'a' | 'b') => {
    Haptics.selectionAsync().catch(() => {})
    const next = { ...answers, [q.id]: choice }
    setAnswers(next)
    if (pos + 1 < queue.length) setPos(pos + 1)
    else finish(next)
  }

  const close = () => {
    // Réponses partielles sans compte : gardées pour reprendre plus tard.
    if (phase === 'play' && answered > 0 && !session) submit.mutate({ answers, completed: false })
    router.back()
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.topBar}>
        {phase === 'play' && pos > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Question précédente" hitSlop={12} onPress={() => setPos(pos - 1)} style={styles.iconBtn}>
            <ChevronLeft size={24} color={colors.paper} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
        <Text style={styles.topTitle}>Tu préfères…</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer le quiz" hitSlop={12} onPress={close} style={styles.iconBtn}>
          <X size={24} color={colors.paper} />
        </Pressable>
      </View>

      {phase === 'intro' ? <Intro answered={answered} onStart={() => startRun('quick')} /> : null}

      {phase === 'play' && queue[pos] ? (
        <Question
          q={queue[pos]}
          index={pos}
          total={queue.length}
          selected={answers[queue[pos].id]}
          onChoose={(c) => choose(queue[pos], c)}
        />
      ) : null}

      {phase === 'result' ? (
        <Result
          answers={answers}
          result={result}
          loggedIn={!!session}
          sending={submit.isPending}
          error={submit.isError ? errorMessage(submit.error) : null}
          onRetry={() => submit.mutate({ answers, completed: true })}
          onMore={answered < TOTAL ? () => startRun('more') : undefined}
          onRestart={() => startRun('restart')}
        />
      ) : null}
    </View>
  )
}

function Intro({ answered, onStart }: { answered: number; onStart: () => void }) {
  return (
    <View style={styles.introBody}>
      <T v="kicker" style={{ color: colors.accentGlow }}>
        Ton profil culturel
      </T>
      <Text style={styles.introTitle} accessibilityRole="header">
        Deux sorties. Une seule réponse.
      </Text>
      <Text style={styles.introText}>
        10 questions, 2 minutes. On en tire ton profil culturel, et ton Drop du lundi s’adapte à tes goûts. Tu pourras ensuite affiner avec 30 questions de
        plus.
      </Text>
      <Button label={answered ? 'Reprendre' : 'Commencer'} kind="light" onPress={onStart} style={{ marginTop: 28 }} />
    </View>
  )
}

function Question({
  q,
  index,
  total,
  selected,
  onChoose,
}: {
  q: QuizQuestion
  index: number
  total: number
  selected: 'a' | 'b' | undefined
  onChoose: (c: 'a' | 'b') => void
}) {
  return (
    <ScrollView contentContainerStyle={styles.qBody} bounces={false}>
      <View>
        <Text style={styles.qCount} accessibilityLiveRegion="polite">
          Question {index + 1} sur {total}
        </Text>
        <View style={{ marginTop: 8 }}>
          <ProgressBar value={index} max={total} dark label={`Question ${index + 1} sur ${total}`} />
        </View>
        <Text style={styles.qCategory}>{CATEGORY_TITLE.get(q.category) ?? ''}</Text>
      </View>
      <Option side="a" option={q.optionA} selected={selected === 'a'} onPress={() => onChoose('a')} />
      <Text style={styles.or} importantForAccessibility="no">
        ou
      </Text>
      <Option side="b" option={q.optionB} selected={selected === 'b'} onPress={() => onChoose('b')} />
    </ScrollView>
  )
}

function Option({
  option,
  selected,
  onPress,
  side,
}: {
  option: QuizQuestion['optionA']
  selected: boolean
  onPress: () => void
  side: 'a' | 'b'
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${side === 'a' ? 'Premier choix' : 'Second choix'} : ${option.text}${option.subtext ? `. ${option.subtext}` : ''}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.option, selected && styles.optionSelected, { opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }]}>
      <Text style={styles.optionEmoji} importantForAccessibility="no">
        {option.emoji}
      </Text>
      <Text style={styles.optionText}>{option.text}</Text>
      {option.subtext ? <Text style={styles.optionSub}>{option.subtext}</Text> : null}
    </Pressable>
  )
}

function Result({
  answers,
  result,
  loggedIn,
  sending,
  error,
  onRetry,
  onMore,
  onRestart,
}: {
  answers: QuizAnswers
  result: ReturnType<typeof scoreQuiz>
  loggedIn: boolean
  sending: boolean
  error: string | null
  onRetry: () => void
  onMore?: () => void
  onRestart: () => void
}) {
  const archetype = ARCHETYPES[result.archetype]
  const left = TOTAL - Object.keys(answers).length
  if (result.answered < MIN_ANSWERS) {
    return (
      <View style={styles.introBody}>
        <Text style={styles.introTitle}>Encore un peu.</Text>
        <Text style={styles.introText}>Réponds à au moins {MIN_ANSWERS} questions pour obtenir ton profil.</Text>
        {onMore ? <Button label="Continuer" kind="light" onPress={onMore} style={{ marginTop: 24 }} /> : null}
      </View>
    )
  }
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 24 }}>
      <View style={styles.resultHead}>
        <Text style={styles.resultEmoji} importantForAccessibility="no">
          {archetype?.emoji}
        </Text>
        <T v="kicker" style={{ color: colors.accentGlow, marginTop: 6 }}>
          Ton profil
        </T>
        <Text style={styles.resultTitle} accessibilityRole="header">
          {archetype?.name ?? result.archetype}
        </Text>
        {archetype ? <Text style={styles.resultTagline}>{archetype.tagline}</Text> : null}
        {archetype ? <Text style={styles.resultText}>{archetype.description}</Text> : null}
        {archetype?.traits.length ? (
          <View style={styles.traits}>
            {archetype.traits.map((t) => (
              <View key={t} style={styles.trait}>
                <Text style={styles.traitText}>{t}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {sending ? <Text style={styles.status}>On enregistre ton profil…</Text> : null}
      {error ? (
        <View style={{ marginTop: 12, marginHorizontal: -GUTTER }}>
          <Notice text={`Ton profil n’a pas été enregistré : ${error}`} tone="error" />
          <View style={{ paddingHorizontal: GUTTER }}>
            <Button label="Réessayer" kind="light" compact onPress={onRetry} style={{ alignSelf: 'flex-start' }} />
          </View>
        </View>
      ) : null}

      <View style={styles.dims}>
        <DimensionBars scores={result.scores} dark />
      </View>

      <View style={{ gap: 10, marginTop: 24 }}>
        {!loggedIn ? (
          <>
            <Text style={styles.resultText}>
              Ton profil est gardé sur ce téléphone. Crée ton compte pour le retrouver partout et recevoir ton Drop du lundi.
            </Text>
            <Button label="Créer mon compte" kind="light" onPress={() => router.push('/connexion')} />
          </>
        ) : null}
        <Button label="Voir mon Drop" kind={loggedIn ? 'light' : 'secondary'} onPress={() => router.replace('/drop')} />
        {onMore ? <Button label={`Affiner : encore ${left} question${left > 1 ? 's' : ''}`} kind="secondary" onPress={onMore} /> : null}
        <Pressable accessibilityRole="button" onPress={onRestart} hitSlop={8} style={styles.restart}>
          <Text style={styles.restartText}>Refaire le quiz depuis le début</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.paper },
  introBody: { flex: 1, justifyContent: 'center', paddingHorizontal: GUTTER + 4 },
  introTitle: { fontFamily: fonts.display, fontSize: 38, lineHeight: 38, letterSpacing: -1, color: colors.paper, marginTop: 10 },
  introText: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: 'rgba(251,250,247,0.82)', marginTop: 14 },
  qBody: { flexGrow: 1, paddingHorizontal: GUTTER, paddingTop: 12, gap: 12, justifyContent: 'center' },
  qCount: { fontFamily: fonts.semibold, fontSize: 14, color: 'rgba(251,250,247,0.75)' },
  qCategory: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.accentGlow, marginTop: 14 },
  option: {
    backgroundColor: colors.nightSoft,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    minHeight: 150,
    justifyContent: 'center',
  },
  optionSelected: { borderColor: colors.accentGlow, backgroundColor: '#2c2552' },
  optionEmoji: { fontSize: 38 },
  optionText: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 25, color: colors.paper, textAlign: 'center', marginTop: 10 },
  optionSub: { fontFamily: fonts.regular, fontSize: 14, color: 'rgba(251,250,247,0.7)', textAlign: 'center', marginTop: 6 },
  or: { fontFamily: fonts.display, fontSize: 16, color: 'rgba(251,250,247,0.5)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 2 },
  resultHead: { paddingTop: 16 },
  resultEmoji: { fontSize: 52 },
  resultTitle: { fontFamily: fonts.display, fontSize: 36, lineHeight: 37, letterSpacing: -0.8, color: colors.paper, marginTop: 2 },
  resultTagline: { fontFamily: fonts.semibold, fontSize: 17, color: colors.accentGlow, marginTop: 6 },
  resultText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: 'rgba(251,250,247,0.85)', marginTop: 10 },
  traits: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  trait: { borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 12, paddingVertical: 6 },
  traitText: { fontFamily: fonts.medium, fontSize: 14, color: colors.paper },
  status: { fontFamily: fonts.medium, fontSize: 14, color: 'rgba(251,250,247,0.7)', marginTop: 12 },
  dims: { marginTop: 24, backgroundColor: colors.nightSoft, borderRadius: radius.xl, padding: 16 },
  restart: { alignSelf: 'center', paddingVertical: 12 },
  restartText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accentGlow },
})
