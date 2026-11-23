/**
 * Paname Club 2.0 · direction « Nuit » (décision du 23/11/2026), mêmes jetons
 * que le site (apps/web/src/styles/globals.css, Design System v5).
 *
 * Une seule ambiance, sombre. Typo Archivo (celle du logo) ; les titres sont des
 * instances condensées générées depuis la police variable du site
 * (assets/fonts/ArchivoDisplay-ExtraBold.ttf = wdth 78 / wght 820,
 * ArchivoTitle-Bold.ttf = wdth 85 / wght 780 ; licence OFL jointe).
 *
 * 7 tailles de texte, pas une de plus : voir `type` et le composant <T>.
 */
import { Platform } from 'react-native'

export const colors = {
  bg: '#0c0b11',
  surface: '#17151f',
  surface2: '#221f2c',
  field: '#1a1823',
  line: 'rgba(255,255,255,0.09)',
  line2: 'rgba(255,255,255,0.18)',
  text: '#f6f4f0',
  text2: '#d9d6df',
  muted: '#a9a5b4',
  faint: '#8c8897',
  accent: '#b39bff',
  accentStrong: '#7c4dff',
  accentSoft: 'rgba(179,155,255,0.14)',
  hot: '#ff6a4d',
  hotSoft: 'rgba(255,106,77,0.16)',
  hotText: '#ff8b73',
  free: '#5be0a4',
  error: '#ff6b6b',
  warning: '#f5b94a',
  white: '#ffffff',
  scrim: 'rgba(0,0,0,0.38)',
  scrimStrong: 'rgba(0,0,0,0.55)',
  glass: 'rgba(12,11,17,0.9)',
  /** Texte et voiles posés sur une photo. */
  onImage: 'rgba(255,255,255,0.88)',
  onImageSoft: 'rgba(255,255,255,0.18)',
  /** Carte « Alertes concerts » et affiche de repli. */
  plum: '#2a1f5c',
  accentLine: 'rgba(179,155,255,0.25)',
  posterFrom: '#2a2140',
  posterTo: '#15121f',

  // Anciens noms, inversés comme sur le site (ink = texte clair, paper = fond sombre),
  // pour les écrans qui ne sont pas encore réécrits.
  ink: '#f6f4f0',
  inkSoft: '#d9d6df',
  paper: '#0c0b11',
  paperDeep: '#17151f',
  cream: '#17151f',
  night: '#13111b',
  nightSoft: '#221f2c',
  accentHover: '#c9b6ff',
  accentGlow: '#cbb9ff',
  neon: '#ff6a4d',
  neonSoft: 'rgba(255,106,77,0.16)',
  gold: '#c0a16c',
  surfaceHover: '#221f2c',
  border: 'rgba(255,255,255,0.09)',
  borderStrong: 'rgba(255,255,255,0.18)',
  textSecondary: '#c9c5d1',
  textMuted: '#a9a5b4',
  success: '#5be0a4',
} as const

export const fonts = {
  regular: 'Archivo_400Regular',
  medium: 'Archivo_500Medium',
  semibold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
  extrabold: 'Archivo_800ExtraBold',
  /** Archivo condensé, titres d'affiche. */
  display: 'ArchivoDisplay',
  /** Archivo semi-condensé, titres de section. */
  title: 'ArchivoTitle',
} as const

/** Les 7 tailles : 44 · 32 · 24 · 18 · 16 · 14 · 12. */
export const type = {
  display: { fontFamily: fonts.display, fontSize: 44, lineHeight: 44, letterSpacing: -0.6 },
  title1: { fontFamily: fonts.display, fontSize: 32, lineHeight: 33, letterSpacing: -0.3 },
  title2: { fontFamily: fonts.title, fontSize: 24, lineHeight: 27, letterSpacing: -0.2 },
  title3: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 23 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  micro: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, letterSpacing: 1, textTransform: 'uppercase' as const },
} as const

export const radius = { sm: 8, md: 12, lg: 14, xl: 20, full: 999 } as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const

/** Gouttière horizontale des écrans. */
export const GUTTER = 20

/** Cible tactile minimale (Apple, Google). */
export const HIT = 44

export const shadow = Platform.select({
  ios: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  default: { elevation: 4 },
})
