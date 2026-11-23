/**
 * Briques d'interface « Nuit » : textes (7 tailles), boutons, pastilles, titres
 * de section, champ de recherche, onglets segmentés, états vides / erreurs /
 * chargement. Jetons : src/theme.ts. Aucune couleur ni taille en dur ailleurs.
 */
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native'
import { Link, type Href } from 'expo-router'
import { ChevronRight, Search } from 'lucide-react-native'
import { colors, fonts, GUTTER, HIT, radius, type } from '@/theme'

type TVariant =
  | 'display'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'body'
  | 'bodyStrong'
  | 'small'
  | 'smallStrong'
  | 'micro'
  // anciens noms, gardés pour les écrans pas encore réécrits
  | 'h1'
  | 'h2'
  | 'h3'
  | 'caption'
  | 'kicker'
  | 'label'

const tStyles = StyleSheet.create({
  display: { ...type.display, color: colors.text },
  title1: { ...type.title1, color: colors.text },
  title2: { ...type.title2, color: colors.text },
  title3: { ...type.title3, color: colors.text },
  body: { ...type.body, color: colors.text2 },
  bodyStrong: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  small: { ...type.small, color: colors.muted },
  smallStrong: { ...type.small, fontFamily: fonts.semibold, color: colors.text },
  micro: { ...type.micro, color: colors.accent },
  h1: { ...type.title1, color: colors.text },
  h2: { ...type.title2, color: colors.text },
  h3: { ...type.title3, color: colors.text },
  caption: { ...type.small, fontFamily: fonts.medium, color: colors.muted },
  kicker: { ...type.micro, color: colors.accent },
  label: { ...type.small, fontFamily: fonts.semibold, color: colors.text },
})

export function T({ v = 'body', style, ...props }: TextProps & { v?: TVariant; style?: StyleProp<TextStyle> }) {
  return <Text maxFontSizeMultiplier={v === 'display' || v === 'title1' ? 1.3 : 1.6} {...props} style={[tStyles[v], style]} />
}

// ── Boutons ─────────────────────────────────────────────────────────────

type BtnKind = 'primary' | 'accent' | 'light' | 'secondary' | 'ghost' | 'danger'

const PALETTE: Record<BtnKind, { bg: string; fg: string; border: string }> = {
  /** Violet plein : l'action principale de l'écran (Réserver). */
  primary: { bg: colors.accentStrong, fg: colors.white, border: colors.accentStrong },
  accent: { bg: colors.accentStrong, fg: colors.white, border: colors.accentStrong },
  /** Clair sur sombre : une action forte secondaire (Se connecter). */
  light: { bg: colors.text, fg: colors.bg, border: colors.text },
  secondary: { bg: 'transparent', fg: colors.text, border: colors.line2 },
  ghost: { bg: 'transparent', fg: colors.text, border: 'transparent' },
  danger: { bg: 'transparent', fg: colors.error, border: colors.error },
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  trailing,
  loading,
  disabled,
  style,
  compact,
  accessibilityHint,
}: {
  label: string
  onPress?: PressableProps['onPress']
  kind?: BtnKind
  icon?: ReactNode
  trailing?: ReactNode
  loading?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  compact?: boolean
  accessibilityHint?: string
}) {
  const p = PALETTE[kind]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnCompact,
        { backgroundColor: p.bg, borderColor: p.border, opacity: disabled ? 0.45 : pressed ? 0.82 : 1 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={p.fg} /> : icon}
      <Text maxFontSizeMultiplier={1.4} style={[styles.btnLabel, compact && styles.btnLabelCompact, { color: p.fg }]}>
        {label}
      </Text>
      {trailing}
    </Pressable>
  )
}

/** Bouton rond 44 pt, pour une icône seule (toujours avec un libellé VoiceOver). */
export function IconButton({
  label,
  onPress,
  children,
  onImage,
  style,
  selected,
}: {
  label: string
  onPress?: () => void
  children: ReactNode
  onImage?: boolean
  style?: StyleProp<ViewStyle>
  selected?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected != null ? { selected } : undefined}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconBtn, onImage ? styles.iconBtnOnImage : styles.iconBtnPlain, { opacity: pressed ? 0.75 : 1 }, style]}>
      {children}
    </Pressable>
  )
}

// ── Pastilles ───────────────────────────────────────────────────────────

export function Chip({
  label,
  active,
  onPress,
  icon,
  small,
  trailing,
  floating,
}: {
  label: string
  active?: boolean
  onPress?: () => void
  icon?: ReactNode
  small?: boolean
  trailing?: ReactNode
  /** Posée sur une carte ou une photo : fond opaque. */
  floating?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.chip,
        small && styles.chipSmall,
        active ? styles.chipOn : styles.chipOff,
        floating && !active && styles.chipFloating,
        { opacity: pressed ? 0.8 : 1 },
      ]}>
      {icon}
      <Text maxFontSizeMultiplier={1.4} style={[styles.chipLabel, small && styles.chipLabelSmall, { color: active ? colors.bg : colors.text }]}>
        {label}
      </Text>
      {trailing}
    </Pressable>
  )
}

/** Deux à quatre onglets côte à côte (À venir / Passées). */
export function Segmented<K extends string>({ options, value, onChange }: { options: Array<{ key: K; label: string }>; value: K; onChange: (k: K) => void }) {
  return (
    <View style={styles.seg} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.key === value
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.key)}
            style={[styles.segItem, on && styles.segItemOn]}>
            <Text maxFontSizeMultiplier={1.4} style={[styles.segLabel, on && { color: colors.text }]}>
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// ── Recherche ───────────────────────────────────────────────────────────

export const SEARCH_PLACEHOLDER = 'Un artiste, un lieu, une envie…'

/** Faux champ (bouton) qui ouvre la vraie recherche. */
export function SearchButton({ onPress, label = SEARCH_PLACEHOLDER, style }: { onPress: () => void; label?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole="search" accessibilityLabel="Rechercher une sortie" onPress={onPress} style={({ pressed }) => [styles.search, { opacity: pressed ? 0.85 : 1 }, style]}>
      <Search size={20} color={colors.muted} />
      <Text style={styles.searchText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

// ── Sections ────────────────────────────────────────────────────────────

export function SectionHeader({
  title,
  subtitle,
  href,
  onMore,
  moreLabel = 'Tout voir',
  kicker,
}: {
  title: string
  subtitle?: string
  href?: Href
  onMore?: () => void
  moreLabel?: string
  /** Ancien surtitre : affiché en sous-titre discret. */
  kicker?: string
}) {
  const more = (
    <Pressable accessibilityRole="link" accessibilityLabel={`${moreLabel} : ${title}`} onPress={onMore} hitSlop={12} style={styles.more}>
      <Text style={styles.moreLabel}>{moreLabel}</Text>
      <ChevronRight size={16} color={colors.accent} />
    </Pressable>
  )
  const sub = subtitle ?? null
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        {kicker && !sub ? <T v="micro" style={{ marginBottom: 4 }}>{kicker}</T> : null}
        <T v="title2" accessibilityRole="header">
          {title}
        </T>
        {sub ? (
          <T v="small" style={{ marginTop: 2 }}>
            {sub}
          </T>
        ) : null}
      </View>
      {href ? (
        <Link href={href} asChild>
          {more}
        </Link>
      ) : onMore ? (
        more
      ) : null}
    </View>
  )
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: 12 }} />
}

// ── États ───────────────────────────────────────────────────────────────

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.accent} />
      <T v="small" style={{ marginTop: 10 }}>
        {label}
      </T>
    </View>
  )
}

/** Silhouette grise d'une ligne de liste, pendant le chargement. */
export function RowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View accessibilityLabel="Chargement" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.skRow}>
          <View style={styles.skThumb} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[styles.skLine, { width: '30%' }]} />
            <View style={[styles.skLine, { width: '80%', height: 14 }]} />
            <View style={[styles.skLine, { width: '55%' }]} />
          </View>
        </View>
      ))}
    </View>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <T v="title3" style={{ textAlign: 'center' }}>
        Impossible de charger
      </T>
      <T v="small" style={{ textAlign: 'center', marginTop: 6, maxWidth: 300 }}>
        {message}
      </T>
      {onRetry ? <Button label="Réessayer" kind="secondary" compact onPress={onRetry} style={{ marginTop: 16 }} /> : null}
    </View>
  )
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <View style={[styles.center, { paddingVertical: 40 }]}>
      <T v="title3" style={{ textAlign: 'center' }}>
        {title}
      </T>
      {text ? (
        <T v="small" style={{ textAlign: 'center', marginTop: 6, maxWidth: 300 }}>
          {text}
        </T>
      ) : null}
      {action ? <View style={{ marginTop: 16 }}>{action}</View> : null}
    </View>
  )
}

/** Bandeau d'information (hors connexion, sortie annulée…). */
export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warning' | 'error' }) {
  const bg = tone === 'info' ? colors.accentSoft : colors.hotSoft
  const fg = tone === 'info' ? colors.accent : tone === 'warning' ? colors.warning : colors.hotText
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityRole="alert">
      <Text style={[styles.noticeText, { color: fg }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 52,
    paddingHorizontal: 22,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnCompact: { minHeight: HIT, paddingHorizontal: 16, borderRadius: radius.full },
  btnLabel: { fontFamily: fonts.bold, fontSize: 16 },
  btnLabelCompact: { fontFamily: fonts.semibold, fontSize: 14 },
  iconBtn: { width: HIT, height: HIT, borderRadius: HIT / 2, alignItems: 'center', justifyContent: 'center' },
  iconBtnPlain: { backgroundColor: colors.surface2 },
  iconBtnOnImage: { backgroundColor: colors.scrim },
  chip: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipSmall: { minHeight: 36, paddingHorizontal: 12 },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  chipOff: { backgroundColor: 'transparent', borderColor: colors.line2 },
  chipFloating: { backgroundColor: colors.glass, borderColor: colors.line2 },
  chipLabel: { fontFamily: fonts.semibold, fontSize: 14 },
  chipLabelSmall: { fontSize: 14 },
  seg: { flexDirection: 'row', padding: 4, borderRadius: radius.md, backgroundColor: colors.surface2 },
  segItem: { flex: 1, minHeight: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segItemOn: { backgroundColor: colors.surface },
  segLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.muted },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchText: { fontFamily: fonts.regular, fontSize: 16, color: colors.muted, flex: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: GUTTER, marginBottom: 14, gap: 12 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 3, minHeight: 32 },
  moreLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accent },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: 16 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, flex: 1 },
  notice: { borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, marginHorizontal: GUTTER, marginBottom: 12 },
  noticeText: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  skRow: { flexDirection: 'row', gap: 12, paddingHorizontal: GUTTER, paddingVertical: 10, alignItems: 'center' },
  skThumb: { width: 76, height: 76, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  skLine: { height: 10, borderRadius: 5, backgroundColor: colors.surface2 },
})
