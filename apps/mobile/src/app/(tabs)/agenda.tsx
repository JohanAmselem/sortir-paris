/**
 * Onglet « Agenda » : la réponse aux dates lointaines (décision du 23/11/2026).
 *   - une seule recherche, qui comprend « samedi », « en mars », « 14 février » ;
 *   - les mois jusqu'en 2028 avec leur nombre de sorties, puis les jours du mois ;
 *   - 3 filtres visibles (catégorie, prix, quartier) et « près de moi » ;
 *   - artistes et lieux quand on a tapé un nom ;
 *   - la liste groupée par jour, année écrite, sans limite de pages (curseur).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import { ChevronDown, LocateFixed, Search, X } from 'lucide-react-native'
import { ARRONDISSEMENTS, CATEGORIES, formatLongDay, parisISODate, type AgendaResponse, type CardEvent } from '@/shared'
import { api, errorMessage } from '@/lib/api'
import { useAgenda } from '@/lib/queries'
import { locate, locateMessage, type Coords } from '@/lib/location'
import { showToast } from '@/lib/toast'
import { track } from '@/lib/analytics'
import { EventCard } from '@/components/EventCard'
import { ArtistFollowButton } from '@/components/event/ArtistFollow'
import { Button, Chip, EmptyState, ErrorState, RowSkeleton, T } from '@/components/ui'
import { colors, fonts, GUTTER, radius, type } from '@/theme'

// ── État des filtres ⇄ paramètres d'URL (même schéma que le site) ─────────

interface Filters {
  q: string
  when: string | null
  cats: string[]
  price: 'free' | '20' | '50' | null
  arr: string[]
  zone: 'paris' | 'banlieue' | null
  near: Coords | null
  /** Texte cherché tel quel (sans lire de date dedans). */
  raw: boolean
  /** Liste « déjà à l'affiche » (expos, saisons) au lieu de la liste par date. */
  affiche: boolean
}

const EMPTY: Filters = { q: '', when: null, cats: [], price: null, arr: [], zone: null, near: null, raw: false, affiche: false }

function fromParams(p: string | undefined): Filters {
  const sp = new URLSearchParams(p ?? '')
  const csv = (k: string) => (sp.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return {
    ...EMPTY,
    q: sp.get('q') ?? '',
    when: sp.get('when'),
    cats: csv('cat'),
    price: sp.get('free') === '1' ? 'free' : sp.get('max') === '20' ? '20' : sp.get('max') === '50' ? '50' : null,
    arr: csv('arr'),
    zone: sp.get('zone') === 'paris' || sp.get('zone') === 'banlieue' ? (sp.get('zone') as 'paris' | 'banlieue') : null,
    affiche: sp.get('affiche') === '1',
  }
}

function toParams(f: Filters, opts: { withWhen?: boolean } = {}): string {
  const sp = new URLSearchParams()
  if (f.q.trim()) sp.set('q', f.q.trim())
  if (opts.withWhen !== false && f.when) sp.set('when', f.when)
  if (f.cats.length) sp.set('cat', f.cats.join(','))
  if (f.price === 'free') sp.set('free', '1')
  else if (f.price) sp.set('max', f.price)
  if (f.arr.length) sp.set('arr', f.arr.join(','))
  if (f.zone) sp.set('zone', f.zone)
  if (f.near) {
    sp.set('lat', f.near.lat.toFixed(4))
    sp.set('lng', f.near.lng.toFixed(4))
  }
  if (f.raw) sp.set('raw', '1')
  if (f.affiche && opts.withWhen !== false) sp.set('affiche', '1')
  return sp.toString()
}

/** Mois d'un `when` (mois ou jour) ; jamais pour une plage (« en 2027 »). */
const monthOf = (when: string | null) => (when && !when.includes('..') && /^\d{4}-\d{2}/.test(when) ? when.slice(0, 7) : null)

// ── Regroupement par jour ─────────────────────────────────────────────────

interface DaySection {
  key: string
  title: string
  count: number | null
  data: CardEvent[]
}

export function groupByDay(events: CardEvent[], dayCounts: Map<string, number>, now = new Date()): DaySection[] {
  const sections: DaySection[] = []
  const seen = new Set<string>()
  for (const e of events) {
    // Un film peut revenir d'une page à l'autre sous une autre séance : une seule carte.
    const uniq = e.film ? `film:${e.film.slug}` : e.id
    if (seen.has(uniq)) continue
    seen.add(uniq)
    const start = new Date(e.startDate)
    const ongoing = start < now
    const key = ongoing ? 'en-cours' : parisISODate(new Date(start.getTime() - 4 * 3600_000))
    let s = sections.at(-1)
    if (!s || s.key !== key) {
      const label = ongoing ? 'En ce moment' : formatLongDay(new Date(`${key}T12:00:00Z`), now)
      s = { key, title: label.charAt(0).toUpperCase() + label.slice(1), count: dayCounts.get(key) ?? null, data: [] }
      sections.push(s)
    }
    s.data.push(e)
  }
  return sections
}

const PRICE_LABEL: Record<NonNullable<Filters['price']>, string> = { free: 'Gratuit', '20': 'Moins de 20 €', '50': 'Moins de 50 €' }
const DAY_LETTERS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']

type Sheet = 'cat' | 'price' | 'place' | null

export default function Agenda() {
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ p?: string; focus?: string; q?: string }>()
  const [f, setF] = useState<Filters>(() => fromParams(params.p))
  const [text, setText] = useState(f.q)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [locating, setLocating] = useState(false)
  const [showOngoing, setShowOngoing] = useState(false)
  const input = useRef<React.ComponentRef<typeof TextInput>>(null)

  // Arrivée depuis l'accueil (« Par envie », « Tout voir », recherche) : les
  // filtres repartent de ce qui est demandé (état ajusté pendant le rendu).
  const routeKey = `${params.p ?? ''}|${params.q ?? ''}`
  const [seenRoute, setSeenRoute] = useState(routeKey)
  if (routeKey !== seenRoute) {
    setSeenRoute(routeKey)
    const next = fromParams(params.p)
    if (params.q) next.q = params.q
    setF(next)
    setText(next.q)
  }
  useEffect(() => {
    if (params.focus === '1') setTimeout(() => input.current?.focus(), 250)
  }, [params.focus])

  // La saisie part 350 ms après la dernière touche.
  useEffect(() => {
    if (text === f.q) return
    const t = setTimeout(() => setF((x) => ({ ...x, q: text, raw: false })), 350)
    return () => clearTimeout(t)
  }, [text, f.q])

  const listParams = toParams(f)
  const list = useAgenda(listParams)
  const first = list.data?.pages[0] as AgendaResponse | undefined
  const understood = first?.understood

  // Date lue dans le texte (« Angèle en mars ») : le texte cherché est alors le reste.
  const dateFromText = !f.when && !f.raw && understood?.when ? understood.when : null
  const textQ = dateFromText ? (understood?.text ?? '') : f.q
  // Mois (toujours) et jours du mois choisi : mêmes filtres, sans la date.
  const month = monthOf(f.when) ?? monthOf(dateFromText)
  const counts = useQuery({
    queryKey: ['agenda-counts', toParams({ ...f, q: textQ, when: null, affiche: false }), month],
    queryFn: () => {
      const sp = new URLSearchParams(toParams({ ...f, q: textQ, when: month, affiche: false }))
      sp.set('limit', '1')
      return api<AgendaResponse>(`/api/v2/agenda?${sp.toString()}`, { timeoutMs: 20_000 })
    },
    staleTime: 10 * 60_000,
  })
  const months = counts.data?.months ?? first?.months ?? []
  const days = counts.data?.days ?? []
  const dayCounts = useMemo(() => new Map(days.map((d) => [d.key, d.n])), [days])

  const events = useMemo(() => (list.data?.pages ?? []).flatMap((p) => p.events), [list.data])
  // Près de moi : triées par distance, donc une seule section.
  const sections = useMemo(() => {
    if (!events.length) return []
    if (f.affiche) return [{ key: 'affiche', title: 'Déjà à l’affiche, ce qui ferme bientôt d’abord', count: null, data: events }]
    if (f.near) return [{ key: 'near', title: 'Autour de toi', count: null, data: events }]
    return groupByDay(events, dayCounts)
  }, [events, dayCounts, f.near, f.affiche])
  const ongoing = first?.ongoing ?? []

  const setWhen = (when: string | null) => {
    track('agenda_when', { kind: when ? (when.length === 7 ? 'month' : 'day') : 'all' })
    Haptics.selectionAsync().catch(() => {})
    // Une date choisie à la main remplace celle lue dans le texte.
    if (dateFromText) setText(textQ)
    setF((x) => ({ ...x, when, q: dateFromText ? textQ : x.q }))
  }
  const toggleNear = async () => {
    if (f.near) return setF((x) => ({ ...x, near: null }))
    setLocating(true)
    const r = await locate()
    setLocating(false)
    if (r.ok) setF((x) => ({ ...x, near: r.coords }))
    else showToast(locateMessage(r.reason))
  }
  const active = f.cats.length + (f.price ? 1 : 0) + f.arr.length + (f.zone ? 1 : 0) + (f.near ? 1 : 0)
  const fromText = dateFromText && understood?.whenLabel ? understood.whenLabel : null

  const header = (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        <Chip small label={f.cats.length ? CATEGORIES.filter((c) => f.cats.includes(c.slug)).map((c) => c.plural).join(', ') : 'Catégorie'} active={f.cats.length > 0} onPress={() => setSheet('cat')} trailing={<ChevronDown size={15} color={f.cats.length ? colors.bg : colors.text} />} />
        <Chip small label={f.price ? PRICE_LABEL[f.price] : 'Prix'} active={!!f.price} onPress={() => setSheet('price')} trailing={<ChevronDown size={15} color={f.price ? colors.bg : colors.text} />} />
        <Chip small label={f.arr.length ? f.arr.join(', ') : f.zone === 'paris' ? 'Paris' : f.zone === 'banlieue' ? 'Banlieue' : 'Quartier'} active={f.arr.length > 0 || !!f.zone} onPress={() => setSheet('place')} trailing={<ChevronDown size={15} color={f.arr.length || f.zone ? colors.bg : colors.text} />} />
        <Chip small label={locating ? 'Position…' : 'Près de moi'} active={!!f.near} icon={<LocateFixed size={15} color={f.near ? colors.bg : colors.text} />} onPress={() => void toggleNear()} />
        {active ? <Chip small label="Effacer" onPress={() => setF((x) => ({ ...EMPTY, q: x.q, when: x.when }))} /> : null}
      </ScrollView>

      {f.affiche ? (
        <View style={styles.understood}>
          <T v="small">Déjà à l’affiche :</T>
          <Chip small label="Expos et saisons" active onPress={() => setF((x) => ({ ...x, affiche: false }))} trailing={<X size={14} color={colors.bg} />} />
        </View>
      ) : null}

      {fromText ? (
        <View style={styles.understood}>
          <T v="small">On a compris :</T>
          <Chip small label={fromText} active onPress={() => setF((x) => ({ ...x, raw: true }))} trailing={<X size={14} color={colors.bg} />} />
        </View>
      ) : null}

      {first?.total != null ? (
        <T v="small" style={styles.count}>
          <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>
            {first.total.toLocaleString('fr-FR')} sortie{first.total > 1 ? 's' : ''}
          </Text>
          {f.near ? ', des plus proches aux plus lointaines' : ', de la plus proche à la plus lointaine'}
        </T>
      ) : null}

      {first?.artists?.length ? (
        <View style={styles.block}>
          <T v="micro" style={{ paddingHorizontal: GUTTER, marginBottom: 6 }}>
            Artistes
          </T>
          <View style={{ paddingHorizontal: GUTTER }}>
            {first.artists.slice(0, 3).map((a) => (
              <ArtistFollowButton key={a.key} artistKey={a.key} name={`${a.name} · ${a.dates} date${a.dates > 1 ? 's' : ''}`} />
            ))}
          </View>
        </View>
      ) : null}

      {first?.venues?.length ? (
        <View style={styles.block}>
          <T v="micro" style={{ paddingHorizontal: GUTTER, marginBottom: 8 }}>
            Lieux
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 8 }}>
            {first.venues.map((v) => (
              <Chip key={v.slug} small label={v.area ? `${v.name} · ${v.area}` : v.name} onPress={() => router.push({ pathname: '/lieux/[slug]', params: { slug: v.slug } })} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {ongoing.length ? (
        <View style={styles.block}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showOngoing }} onPress={() => setShowOngoing((x) => !x)} style={styles.ongoingHead}>
            <T v="title3">À l’affiche pendant cette période</T>
            <ChevronDown size={18} color={colors.muted} style={{ transform: [{ rotate: showOngoing ? '180deg' : '0deg' }] }} />
          </Pressable>
          {(showOngoing ? ongoing : ongoing.slice(0, 2)).map((e) => (
            <View key={e.id} style={{ paddingHorizontal: GUTTER }}>
              <EventCard event={e} variant="row" origin="agenda-affiche" />
            </View>
          ))}
          {showOngoing && (first?.ongoingTotal ?? 0) > ongoing.length ? (
            <Button
              label={`Tout voir · ${first?.ongoingTotal} à l’affiche`}
              kind="secondary"
              compact
              style={{ alignSelf: 'flex-start', marginHorizontal: GUTTER, marginTop: 8 }}
              onPress={() => setF((x) => ({ ...x, affiche: true }))}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.head, { paddingTop: insets.top + 6 }]}>
        <T v="title1" accessibilityRole="header" style={{ paddingHorizontal: GUTTER }}>
          Agenda
        </T>
        <View style={styles.searchBox}>
          <Search size={19} color={colors.muted} />
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => setF((x) => ({ ...x, q: text, raw: false }))}
            placeholder="Un artiste, un lieu, « jazz samedi »…"
            placeholderTextColor={colors.faint}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="never"
            accessibilityLabel="Rechercher dans l’agenda"
            keyboardAppearance="dark"
          />
          {text ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Effacer la recherche" hitSlop={12} onPress={() => { setText(''); setF((x) => ({ ...x, q: '', raw: false })) }}>
              <X size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.months}>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: !month && !f.when }} onPress={() => setWhen(null)} style={[styles.month, !month && !f.when && styles.monthOn]}>
            <Text style={[styles.monthLabel, !month && !f.when && styles.monthLabelOn]}>Tout</Text>
            <Text style={[styles.monthCount, !month && !f.when && styles.monthLabelOn]}>à venir</Text>
          </Pressable>
          {months.map((m) => {
            const on = month === m.key
            return (
              <Pressable
                key={m.key}
                accessibilityRole="button"
                accessibilityLabel={`${m.label}, ${m.n} sorties`}
                accessibilityState={{ selected: on, disabled: m.n === 0 }}
                disabled={m.n === 0}
                onPress={() => setWhen(on && f.when === m.key ? null : m.key)}
                style={[styles.month, on && styles.monthOn, m.n === 0 && { opacity: 0.4 }]}>
                <Text style={[styles.monthLabel, on && styles.monthLabelOn]}>{m.label}</Text>
                <Text style={[styles.monthCount, on && styles.monthLabelOn]}>{m.n.toLocaleString('fr-FR')}</Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {month && days.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
            {days.map((d) => {
              const on = f.when === d.key
              const wd = new Date(`${d.key}T12:00:00Z`).getUTCDay()
              return (
                <Pressable
                  key={d.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatLongDay(new Date(`${d.key}T12:00:00Z`))}, ${d.n} sorties`}
                  accessibilityState={{ selected: on }}
                  onPress={() => setWhen(on ? d.key.slice(0, 7) : d.key)}
                  style={[styles.day, on && styles.dayOn]}>
                  <Text style={[styles.dayLetter, on && { color: colors.accent }]}>{DAY_LETTERS[wd]}</Text>
                  <Text style={[styles.dayNum, on && { color: colors.accent }]}>{Number(d.key.slice(8))}</Text>
                  <View style={[styles.dot, { opacity: d.n > 0 ? 1 : 0 }]} />
                </Pressable>
              )
            })}
          </ScrollView>
        ) : null}
      </View>

      {list.isError && !list.data ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(e) => e.id}
          contentInsetAdjustmentBehavior="automatic"
          stickySectionHeadersEnabled
          keyboardDismissMode="on-drag"
          ListHeaderComponent={header}
          renderSectionHeader={({ section }) => (
            <View style={styles.dayHead}>
              <Text style={styles.dayHeadTitle}>{section.title}</Text>
              {section.count != null ? (
                <Text style={styles.dayHeadCount}>
                  {section.count} sortie{section.count > 1 ? 's' : ''}
                </Text>
              ) : null}
            </View>
          )}
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: GUTTER }}>
              <EventCard event={item} variant="row" origin="agenda" />
            </View>
          )}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage()
          }}
          ListEmptyComponent={
            list.isLoading || list.isPlaceholderData ? (
              <RowSkeleton count={6} />
            ) : (
              <EmptyState
                title="Rien pour ces critères"
                text={f.when ? 'Essaie un autre mois, ou retire un filtre.' : 'Retire un filtre ou cherche autre chose.'}
                action={active || f.when || f.q ? <Button label="Tout effacer" kind="secondary" compact onPress={() => { setText(''); setF(EMPTY) }} /> : undefined}
              />
            )
          }
          ListFooterComponent={
            list.isFetchingNextPage ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
            ) : events.length && !list.hasNextPage ? (
              <T v="small" style={{ textAlign: 'center', marginVertical: 28 }}>
                C’est tout pour cette période.
              </T>
            ) : (
              <View style={{ height: 24 }} />
            )
          }
          initialNumToRender={12}
          windowSize={9}
        />
      )}

      <FilterSheet sheet={sheet} onClose={() => setSheet(null)} f={f} setF={setF} />
    </View>
  )
}

// ── Feuilles de filtres ───────────────────────────────────────────────────

function FilterSheet({ sheet, onClose, f, setF }: { sheet: Sheet; onClose: () => void; f: Filters; setF: (fn: (x: Filters) => Filters) => void }) {
  const insets = useSafeAreaInsets()
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  return (
    <Modal visible={sheet != null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Fermer" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.grabber} />
        <T v="title2" style={{ marginBottom: 14 }}>
          {sheet === 'cat' ? 'Catégorie' : sheet === 'price' ? 'Prix' : 'Où'}
        </T>
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={styles.sheetChips}>
          {sheet === 'cat'
            ? CATEGORIES.map((c) => <Chip key={c.slug} label={c.plural} active={f.cats.includes(c.slug)} onPress={() => setF((x) => ({ ...x, cats: toggle(x.cats, c.slug).slice(0, 4) }))} />)
            : null}
          {sheet === 'price'
            ? (['free', '20', '50'] as const).map((p) => <Chip key={p} label={PRICE_LABEL[p]} active={f.price === p} onPress={() => setF((x) => ({ ...x, price: x.price === p ? null : p }))} />)
            : null}
          {sheet === 'place' ? (
            <>
              <Chip label="Paris" active={f.zone === 'paris'} onPress={() => setF((x) => ({ ...x, zone: x.zone === 'paris' ? null : 'paris' }))} />
              <Chip label="Banlieue" active={f.zone === 'banlieue'} onPress={() => setF((x) => ({ ...x, zone: x.zone === 'banlieue' ? null : 'banlieue', arr: [] }))} />
              <View style={{ width: '100%', height: 8 }} />
              {ARRONDISSEMENTS.map((a) => (
                <Chip key={a} small label={a} active={f.arr.includes(a)} onPress={() => setF((x) => ({ ...x, arr: toggle(x.arr, a).slice(0, 6), zone: x.zone === 'banlieue' ? null : x.zone }))} />
              ))}
            </>
          ) : null}
        </ScrollView>
        <Button label="Voir les sorties" onPress={onClose} style={{ marginTop: 16 }} />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  head: { backgroundColor: colors.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingBottom: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: GUTTER, marginTop: 12, minHeight: 48, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: colors.field, borderWidth: 1, borderColor: colors.line },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.text, paddingVertical: 10 },
  months: { paddingHorizontal: GUTTER, gap: 6, paddingTop: 12 },
  month: { minWidth: 66, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, borderWidth: 1, borderColor: colors.line2, alignItems: 'center' },
  monthOn: { backgroundColor: colors.text, borderColor: colors.text },
  monthLabel: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  monthCount: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 1 },
  monthLabelOn: { color: colors.bg },
  days: { paddingHorizontal: GUTTER, gap: 4, paddingTop: 10 },
  day: { width: 44, paddingVertical: 6, borderRadius: 12, alignItems: 'center' },
  dayOn: { backgroundColor: colors.accentSoft },
  dayLetter: { fontFamily: fonts.semibold, fontSize: 11, textTransform: 'uppercase', color: colors.muted },
  dayNum: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, marginTop: 1 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent, marginTop: 3 },
  filters: { paddingHorizontal: GUTTER, gap: 8, paddingTop: 12 },
  understood: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: GUTTER, marginTop: 12 },
  count: { paddingHorizontal: GUTTER, marginTop: 14 },
  block: { marginTop: 18 },
  ongoingHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, minHeight: 44 },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: GUTTER, paddingTop: 16, paddingBottom: 6, backgroundColor: colors.bg },
  dayHeadTitle: { ...type.title3, fontSize: 16, color: colors.text },
  dayHeadCount: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  scrim: { flex: 1, backgroundColor: colors.scrimStrong },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: GUTTER, paddingTop: 10 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line2, marginBottom: 14 },
  sheetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
