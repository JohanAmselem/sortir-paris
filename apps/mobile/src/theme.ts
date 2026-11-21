/**
 * Marque Paname Club, reprise du site (apps/web/src/styles/globals.css,
 * couleurs OKLCH converties) : police Archivo, crème, encre, nuit, violet.
 */
import { Platform } from 'react-native'

export const colors = {
  ink: '#16151f',
  inkSoft: '#2d2c37',
  paper: '#fbfaf7',
  paperDeep: '#f3f0ea',
  cream: '#f7f5ef',
  night: '#131027',
  nightSoft: '#23203b',
  accent: '#7436e3',
  accentHover: '#6322c9',
  accentSoft: '#f2efff',
  accentGlow: '#b09cff',
  neon: '#de3f25',
  neonSoft: '#ffebe5',
  gold: '#c0a16c',
  surface: '#fefdfc',
  surfaceHover: '#f5f3ef',
  border: '#e0ded8',
  borderStrong: '#c7c4bd',
  textSecondary: '#4d4c55',
  textMuted: '#63626a',
  success: '#008856',
  warning: '#da950b',
  error: '#cc2827',
  free: '#00774b',
  white: '#ffffff',
} as const

export const fonts = {
  regular: 'Archivo_400Regular',
  medium: 'Archivo_500Medium',
  semibold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
  display: 'Archivo_800ExtraBold',
} as const

export const radius = { sm: 6, md: 10, lg: 14, xl: 20, full: 999 } as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const

/** Gouttière horizontale des écrans. */
export const GUTTER = 16

export const shadow = Platform.select({
  ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  default: { elevation: 2 },
})
