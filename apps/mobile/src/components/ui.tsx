/**
 * Briques d'interface : textes (Archivo), boutons, pastilles, titres de section,
 * états vides / erreurs / chargement. Couleurs et rayons : src/theme.ts.
 */
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native'
import { Link, type Href } from 'expo-router'
import { ChevronRight } from 'lucide-react-native'
import { colors, fonts, GUTTER, radius } from '@/theme'

type TVariant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyStrong' | 'small' | 'caption' | 'kicker' | 'label'

const tStyles = StyleSheet.create({
  display: { fontFamily: fonts.display, fontSize: 40, lineHeight: 40, letterSpacing: -1, color: colors.ink },
  h1: { fontFamily: fonts.display, fontSize: 30, lineHeight: 32, letterSpacing: -0.6, color: colors.ink },
  h2: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 26, letterSpacing: -0.3, color: colors.ink },
  h3: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: colors.ink },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.ink },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.textSecondary },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 17, color: colors.textSecondary },
  kicker: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.accent },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18, color: colors.ink },
})

export function T({ v = 'body', style, ...props }: TextProps & { v?: TVariant; style?: StyleProp<TextStyle> }) {
  return <Text maxFontSizeMultiplier={1.6} {...props} style={[tStyles[v], style]} />
}

// ── Boutons ─────────────────────────────────────────────────────────────

type BtnKind = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'light'

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
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
  loading?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  compact?: boolean
  accessibilityHint?: string
}) {
  const palette: Record<BtnKind, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.ink, fg: colors.paper, border: colors.ink },
    accent: { bg: colors.accent, fg: colors.white, border: colors.accent },
    secondary: { bg: colors.surface, fg: colors.ink, border: colors.borderStrong },
    ghost: { bg: 'transparent', fg: colors.ink, border: 'transparent' },
    danger: { bg: colors.surface, fg: colors.error, border: colors.error },
    light: { bg: colors.paper, fg: colors.ink, border: colors.paper },
  }
  const p = palette[kind]
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
        { backgroundColor: p.bg, borderColor: p.border, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={p.fg} /> : icon}
      <Text maxFontSizeMultiplier={1.4} style={[styles.btnLabel, compact && { fontSize: 14 }, { color: p.fg }]}>
        {label}
      </Text>
    </Pressable>
  )
}

// ── Pastilles ───────────────────────────────────────────────────────────

export function Chip({
  label,
  active,
  onPress,
  dark,
  icon,
}: {
  label: string
  active?: boolean
  onPress?: () => void
  dark?: boolean
  icon?: ReactNode
}) {
  const bg = active ? (dark ? colors.paper : colors.ink) : dark ? 'rgba(255,255,255,0.08)' : colors.surface
  const fg = active ? (dark ? colors.ink : colors.paper) : dark ? colors.paper : colors.ink
  const border = active ? bg : dark ? 'rgba(255,255,255,0.22)' : colors.border
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.chip, { backgroundColor: bg, borderColor: border, opacity: pressed ? 0.8 : 1 }]}>
      {icon}
      <Text maxFontSizeMultiplier={1.4} style={[styles.chipLabel, { color: fg }]}>
        {label}
      </Text>
    </Pressable>
  )
}

// ── Sections ────────────────────────────────────────────────────────────

export function SectionHeader({ kicker, title, href, onMore, moreLabel = 'Tout voir' }: { kicker?: string; title: string; href?: Href; onMore?: () => void; moreLabel?: string }) {
  const more = (
    <Pressable accessibilityRole="link" onPress={onMore} hitSlop={10} style={styles.more}>
      <Text style={styles.moreLabel}>{moreLabel}</Text>
      <ChevronRight size={16} color={colors.accent} />
    </Pressable>
  )
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        {kicker ? <T v="kicker">{kicker}</T> : null}
        <T v="h2" accessibilityRole="header" style={{ marginTop: kicker ? 2 : 0 }}>
          {title}
        </T>
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
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 12 }} />
}

// ── États ───────────────────────────────────────────────────────────────

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.accent} />
      <T v="caption" style={{ marginTop: 10 }}>
        {label}
      </T>
    </View>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <T v="h3" style={{ textAlign: 'center' }}>
        Oups.
      </T>
      <T v="small" style={{ textAlign: 'center', marginTop: 6 }}>
        {message}
      </T>
      {onRetry ? <Button label="Réessayer" kind="secondary" compact onPress={onRetry} style={{ marginTop: 16 }} /> : null}
    </View>
  )
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <View style={[styles.center, { paddingVertical: 40 }]}>
      <T v="h3" style={{ textAlign: 'center' }}>
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

/** Bandeau d'information (hors-ligne, élargissement de la recherche…). */
export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warning' | 'error' }) {
  const bg = tone === 'error' ? colors.neonSoft : tone === 'warning' ? '#fff6e0' : colors.accentSoft
  const fg = tone === 'error' ? colors.error : tone === 'warning' ? '#7a5200' : colors.accentHover
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityRole="alert">
      <Text style={[styles.noticeText, { color: fg }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnCompact: { minHeight: 40, paddingHorizontal: 14 },
  btnLabel: { fontFamily: fonts.semibold, fontSize: 16 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipLabel: { fontFamily: fonts.medium, fontSize: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: GUTTER, marginBottom: 12, gap: 12 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 3 },
  moreLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accent },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 16 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, flex: 1 },
  notice: { borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, marginHorizontal: GUTTER, marginBottom: 12 },
  noticeText: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
})
