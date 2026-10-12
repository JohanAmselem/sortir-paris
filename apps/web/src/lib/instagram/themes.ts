/**
 * Instagram themes: carousels (one per time window) and stories (one per
 * theme). Fixed hashtag lists (10 to 15 each, Instagram allows 30).
 */
import type { Candidate, PostKind, WindowKind } from './types'
import { foldText } from '@/lib/events/fold'

export type CarouselTheme = WindowKind
export type StoryTheme = 'concerts' | 'expos' | 'theatre-humour' | 'gratuit' | 'en-famille' | 'soirees'
export type ThemeKey = CarouselTheme | StoryTheme

const BASE_TAGS = ['#paris', '#sortirparis', '#quefaireaparis', '#agendaparis', '#parisculture', '#panameclub']

export interface CarouselThemeMeta {
  key: CarouselTheme
  /** Cover headline. */
  headline: string
  /** Short label (admin, link-in-bio page). */
  label: string
  hashtags: string[]
}

export const CAROUSEL_THEMES: Record<CarouselTheme, CarouselThemeMeta> = {
  demain: {
    key: 'demain',
    headline: 'Demain à Paris',
    label: 'Demain à Paris',
    hashtags: [...BASE_TAGS, '#sortiesparis', '#ideesortie', '#parisjetaime', '#parisevents', '#concertparis', '#theatreparis', '#expoparis'],
  },
  semaine: {
    key: 'semaine',
    headline: 'Ta semaine à Paris',
    label: 'Ta semaine à Paris',
    hashtags: [...BASE_TAGS, '#sortiesparis', '#ideesortie', '#parisjetaime', '#parisevents', '#agendaculturel', '#semaineaparis'],
  },
  weekend: {
    key: 'weekend',
    headline: 'Ton week-end à Paris',
    label: 'Ton week-end à Paris',
    hashtags: [...BASE_TAGS, '#weekendaparis', '#weekendparis', '#ideesortie', '#parisjetaime', '#parisevents', '#sortiesparis'],
  },
}

export interface StoryThemeMeta {
  key: StoryTheme
  label: string
  /** Does the event belong to the theme? */
  match: (e: Candidate) => boolean
  hashtags: string[]
}

// Stricter than INTENT_RULES['en-famille'] (whose 'conte' also matches « contemporain »).
const familyRe = /(enfant|en famille|familial|famille|jeune public|\bkids\b|des [0-9]+ ans|a partir de [0-9]+ ans|\bcontes?\b|marionnette|gouter|tout-petits|\bbebes?\b)/
const adultRe = /\b(18 ?\+|interdit aux moins|strip|burlesque|erotique)\b/

export const STORY_THEMES: Record<StoryTheme, StoryThemeMeta> = {
  concerts: {
    key: 'concerts',
    label: 'Concerts',
    match: (e) => e.categorySlug === 'concerts',
    hashtags: [...BASE_TAGS, '#concertparis', '#concert', '#livemusic', '#musiquelive', '#parismusique', '#jazzparis'],
  },
  expos: {
    key: 'expos',
    label: 'Expos',
    match: (e) => e.categorySlug === 'expos',
    hashtags: [...BASE_TAGS, '#expoparis', '#exposition', '#museeparis', '#artparis', '#artcontemporain', '#parismusees'],
  },
  'theatre-humour': {
    key: 'theatre-humour',
    label: 'Théâtre & humour',
    match: (e) => e.categorySlug === 'theatre' || e.categorySlug === 'spectacles',
    hashtags: [...BASE_TAGS, '#theatreparis', '#theatre', '#humour', '#standup', '#spectacle', '#scene'],
  },
  gratuit: {
    key: 'gratuit',
    label: 'Gratuit',
    match: (e) => e.priceStatus === 'free',
    hashtags: [...BASE_TAGS, '#parisgratuit', '#gratuit', '#bonplanparis', '#sortiegratuite', '#bonsplans', '#parispascher'],
  },
  'en-famille': {
    key: 'en-famille',
    label: 'En famille',
    match: (e) => {
      const text = foldText(`${e.title} ${e.shortDesc ?? ''}`)
      return familyRe.test(text) && !adultRe.test(text)
    },
    hashtags: [...BASE_TAGS, '#parisenfamille', '#enfantsparis', '#sortieenfants', '#parisaveclesenfants', '#famille', '#mercredi'],
  },
  soirees: {
    key: 'soirees',
    label: 'Soirées',
    match: (e) => e.categorySlug === 'soirees',
    hashtags: [...BASE_TAGS, '#soireeparis', '#parisnightlife', '#clubbing', '#djset', '#fete', '#nuitparis'],
  },
}

export const STORY_THEME_KEYS = Object.keys(STORY_THEMES) as StoryTheme[]
export const CAROUSEL_THEME_KEYS = Object.keys(CAROUSEL_THEMES) as CarouselTheme[]

export function isCarouselTheme(t: string): t is CarouselTheme {
  return t in CAROUSEL_THEMES
}
export function isStoryTheme(t: string): t is StoryTheme {
  return t in STORY_THEMES
}

/** Human label of a (kind, theme) pair. */
export function themeLabel(kind: PostKind, theme: string): string {
  if (kind === 'carousel' && isCarouselTheme(theme)) return CAROUSEL_THEMES[theme].label
  if (isStoryTheme(theme)) return `Story · ${STORY_THEMES[theme].label}`
  return theme
}

export function hashtagsFor(theme: string): string[] {
  if (isCarouselTheme(theme)) return CAROUSEL_THEMES[theme].hashtags
  if (isStoryTheme(theme)) return STORY_THEMES[theme].hashtags
  return BASE_TAGS
}
