import { useMemo, useRef, useState, type ComponentRef } from 'react'
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { ChevronDown, ChevronRight, MapPin, Search, X } from 'lucide-react-native'
import { ARRONDISSEMENTS, CATEGORIES, INTENTS } from '@/shared'
import { Button, Chip, SectionHeader, T } from '@/components/ui'
import { CategoryGrid } from '@/components/explore/CategoryGrid'
import { EventResults } from '@/components/explore/EventResults'
import { FilterSheet } from '@/components/explore/FilterSheet'
import { useMeta, useSuggest } from '@/lib/queries'
import { appRouteForWebPath } from '@/lib/links'
import { track } from '@/lib/analytics'
import { EMPTY_FILTERS, WHEN_OPTIONS, arrLabel, countActiveFilters, filtersToParams, toggleIn, useDebounced, type ExploreFilters } from '@/lib/explore'
import { colors, fonts, GUTTER, radius } from '@/theme'

type SheetKind = 'cat' | 'arr' | 'mood' | null

const CAT_OPTIONS = CATEGORIES.map((c) => ({ value: c.slug, label: c.plural }))
const ARR_OPTIONS = ARRONDISSEMENTS.map((a) => ({ value: a, label: a }))
const MOOD_OPTIONS = INTENTS.map((i) => ({ value: i.slug, label: i.label }))

export default function ExplorerScreen() {
  const insets = useSafeAreaInsets()
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null)
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [filters, setFilters] = useState<ExploreFilters>(EMPTY_FILTERS)
  const [sheet, setSheet] = useState<SheetKind>(null)

  const debounced = useDebounced(text.trim(), 300)
  const showSuggest = focused && debounced.length >= 2 && debounced !== query
  const suggest = useSuggest(showSuggest ? debounced : '')

  const active = countActiveFilters(filters)
  const searching = query.length > 0 || active > 0
  const params = useMemo(() => filtersToParams(filters, query), [filters, query])

  const update = (patch: Partial<ExploreFilters>, type: string) => {
    setFilters((f) => ({ ...f, ...patch }))
    track('filter', { type })
  }

  const submit = () => {
    const q = text.trim()
    setQuery(q)
    Keyboard.dismiss()
    if (q) track('search', { length: q.length, source: 'explorer' })
  }

  const clearAll = () => {
    setText('')
    setQuery('')
    setFilters(EMPTY_FILTERS)
  }

  const pickCategory = (slug: string) => {
    setText('')
    setQuery('')
    Keyboard.dismiss()
    update({ categories: [slug] }, 'category')
  }

  const openSuggestedPath = (href: string) => {
    const slug = /^\/categories\/([^/?#]+)/.exec(href)?.[1]
    if (slug) return pickCategory(slug)
    const route = appRouteForWebPath(href)
    Keyboard.dismiss()
    if (route) router.push(route)
  }

  const sheetProps =
    sheet === 'cat'
      ? { title: 'Catégories', options: CAT_OPTIONS, selected: filters.categories, key: 'categories' as const }
      : sheet === 'arr'
        ? { title: 'Arrondissements', options: ARR_OPTIONS, selected: filters.arrondissements, key: 'arrondissements' as const }
        : sheet === 'mood'
          ? { title: 'Ambiance', options: MOOD_OPTIONS, selected: filters.intents, key: 'intents' as const }
          : null

  const header = (
    <View style={{ paddingTop: insets.top + 8, backgroundColor: colors.paper }}>
      <View style={styles.titleRow}>
        <T v="h1" accessibilityRole="header">
          Explorer
        </T>
        {searching ? (
          <Pressable accessibilityRole="button" onPress={clearAll} hitSlop={10}>
            <Text style={styles.reset}>Tout effacer</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.searchBox}>
        <Search size={18} color={colors.textMuted} />
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={submit}
          placeholder="Un artiste, un lieu, « jazz », « expo gratuite »…"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="never"
          accessibilityLabel="Rechercher une sortie"
          style={styles.input}
          maxLength={120}
        />
        {text ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Effacer la recherche"
            hitSlop={10}
            onPress={() => {
              setText('')
              setQuery('')
              inputRef.current?.focus()
            }}>
            <X size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} keyboardShouldPersistTaps="handled">
        {WHEN_OPTIONS.map((w) => (
          <Chip key={w.key} label={w.label} active={filters.when === w.key} onPress={() => update({ when: filters.when === w.key ? null : w.key }, 'when')} />
        ))}
        <View style={styles.sepV} />
        <Chip label="Gratuit" active={filters.free} onPress={() => update({ free: !filters.free }, 'free')} />
        <Chip label="Moins de 20 €" active={filters.under20 && !filters.free} onPress={() => update({ under20: !filters.under20, free: false }, 'price')} />
        <Chip
          label={filters.categories.length ? `Catégories · ${filters.categories.length}` : 'Catégories'}
          active={filters.categories.length > 0}
          onPress={() => setSheet('cat')}
          icon={<ChevronDown size={14} color={filters.categories.length ? colors.paper : colors.ink} />}
        />
        <Chip
          label={filters.arrondissements.length ? `Quartier · ${filters.arrondissements.length}` : 'Quartier'}
          active={filters.arrondissements.length > 0}
          onPress={() => setSheet('arr')}
          icon={<ChevronDown size={14} color={filters.arrondissements.length ? colors.paper : colors.ink} />}
        />
        <Chip
          label={filters.intents.length ? `Ambiance · ${filters.intents.length}` : 'Ambiance'}
          active={filters.intents.length > 0}
          onPress={() => setSheet('mood')}
          icon={<ChevronDown size={14} color={filters.intents.length ? colors.paper : colors.ink} />}
        />
      </ScrollView>
    </View>
  )

  return (
    <View style={styles.screen}>
      {header}

      {searching ? (
        <EventResults
          params={params}
          origin="explorer"
          empty={{
            title: query ? `Rien pour « ${query} »` : 'Rien pour ces critères',
            text: 'Essaie une autre date, retire un filtre, ou cherche un autre mot.',
            action: <Button label="Tout effacer" kind="secondary" compact onPress={clearAll} />,
          }}
        />
      ) : (
        <Discovery onPickCategory={pickCategory} />
      )}

      {showSuggest && suggest.data ? (
        <SuggestPanel
          top={insets.top + 8 + 44 + 56}
          data={suggest.data}
          onSearch={submit}
          query={debounced}
          onVenue={(slug) => {
            Keyboard.dismiss()
            router.push({ pathname: '/lieux/[slug]', params: { slug } })
          }}
          onPath={openSuggestedPath}
        />
      ) : null}

      {sheetProps ? (
        <FilterSheet
          visible
          title={sheetProps.title}
          options={sheetProps.options}
          selected={sheetProps.selected}
          onToggle={(v) => update({ [sheetProps.key]: toggleIn(sheetProps.selected, v) } as Partial<ExploreFilters>, sheetProps.key)}
          onClear={() => update({ [sheetProps.key]: [] } as Partial<ExploreFilters>, sheetProps.key)}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </View>
  )
}

/** Sans recherche ni filtre : catégories, sélections, quartiers. */
function Discovery({ onPickCategory }: { onPickCategory: (slug: string) => void }) {
  const meta = useMeta()
  const collections = meta.data?.collections ?? []
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={styles.block}>
        <SectionHeader kicker="Par envie" title="Catégories" />
        <View style={{ paddingHorizontal: GUTTER }}>
          <CategoryGrid onPick={(slug) => onPickCategory(slug)} />
        </View>
      </View>

      {collections.length ? (
        <View style={styles.block}>
          <SectionHeader kicker="Envie de…" title="Nos sélections" />
          <View style={styles.list}>
            {collections.map((c, i) => (
              <Pressable
                key={c.slug}
                accessibilityRole="button"
                accessibilityLabel={`${c.title}. ${c.tagline}`}
                onPress={() => {
                  track('collection_open', { slug: c.slug })
                  router.push({ pathname: '/liste', params: { params: c.params, title: c.title, kicker: 'Sélection', text: c.tagline } })
                }}
                style={({ pressed }) => [styles.collection, i > 0 && styles.collectionBorder, { opacity: pressed ? 0.7 : 1 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.collectionTitle}>{c.title}</Text>
                  <Text style={styles.collectionText} numberOfLines={2}>
                    {c.tagline}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.block}>
        <SectionHeader kicker="Par quartier" title="Où ça ?" />
        <View style={styles.arrGrid}>
          {ARRONDISSEMENTS.map((a) => (
            <Pressable
              key={a}
              accessibilityRole="button"
              accessibilityLabel={`Sorties à ${arrLabel(a)}`}
              onPress={() => router.push({ pathname: '/liste', params: { params: `arr=${encodeURIComponent(a)}`, title: arrLabel(a), kicker: 'Par quartier' } })}
              style={({ pressed }) => [styles.arr, { opacity: pressed ? 0.7 : 1 }]}>
              <Text style={styles.arrText}>{a}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  )
}

/** Suggestions pendant la frappe : lieux, sorties, catégories. */
function SuggestPanel({
  top,
  data,
  query,
  onSearch,
  onVenue,
  onPath,
}: {
  top: number
  data: { venues: Array<{ name: string; slug: string; area: string | null }>; categories: Array<{ label: string; href: string }>; events: Array<{ title: string; href: string; venue: string | null }> }
  query: string
  onSearch: () => void
  onVenue: (slug: string) => void
  onPath: (href: string) => void
}) {
  const empty = !data.venues.length && !data.categories.length && !data.events.length
  return (
    <View style={[styles.suggest, { top }]} accessibilityLabel="Suggestions">
      <ScrollView keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={onSearch} style={styles.suggestRow}>
          <Search size={16} color={colors.accent} />
          <Text style={[styles.suggestText, { color: colors.accent, fontFamily: fonts.semibold }]} numberOfLines={1}>
            Chercher « {query} »
          </Text>
        </Pressable>
        {data.categories.map((c) => (
          <Pressable key={c.href} accessibilityRole="button" onPress={() => onPath(c.href)} style={styles.suggestRow}>
            <Text style={styles.suggestKind}>Catégorie</Text>
            <Text style={styles.suggestText} numberOfLines={1}>
              {c.label}
            </Text>
          </Pressable>
        ))}
        {data.venues.map((v) => (
          <Pressable key={v.slug} accessibilityRole="button" onPress={() => onVenue(v.slug)} style={styles.suggestRow}>
            <MapPin size={15} color={colors.textMuted} />
            <Text style={styles.suggestText} numberOfLines={1}>
              {v.name}
              {v.area ? <Text style={styles.suggestMuted}> · {v.area}</Text> : null}
            </Text>
          </Pressable>
        ))}
        {data.events.map((e) => (
          <Pressable key={e.href} accessibilityRole="button" onPress={() => onPath(e.href)} style={styles.suggestRow}>
            <Text style={styles.suggestText} numberOfLines={1}>
              {e.title}
              {e.venue ? <Text style={styles.suggestMuted}> · {e.venue}</Text> : null}
            </Text>
          </Pressable>
        ))}
        {empty ? <Text style={[styles.suggestMuted, { padding: 14 }]}>Pas de suggestion : valide pour lancer la recherche.</Text> : null}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, height: 44 },
  reset: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accent },
  searchBox: {
    marginHorizontal: GUTTER,
    marginTop: 4,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingVertical: 0 },
  filters: { paddingHorizontal: GUTTER, paddingVertical: 12, gap: 8, alignItems: 'center' },
  sepV: { width: StyleSheet.hairlineWidth, height: 22, backgroundColor: colors.borderStrong, marginHorizontal: 2 },
  block: { marginTop: 20 },
  list: { marginHorizontal: GUTTER, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  collection: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  collectionBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  collectionTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  collectionText: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  arrGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: GUTTER },
  arr: {
    width: 64,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  suggest: {
    position: 'absolute',
    left: GUTTER,
    right: GUTTER,
    maxHeight: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    overflow: 'hidden',
  },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 46, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  suggestKind: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.accent },
  suggestText: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  suggestMuted: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted },
})
