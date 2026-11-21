/**
 * Contrat de l'API de l'appli mobile (`/api/v1/*`).
 *
 * Fichier PUR : aucun import serveur, seulement des types. L'appli Expo
 * (apps/mobile) l'importe tel quel ; les routes vérifient leurs réponses avec
 * `satisfies`, donc toute dérive casse la compilation des deux côtés.
 *
 * Routes déjà existantes que l'appli appelle aussi telles quelles :
 *   GET  /api/events?…&limit&offset     → EventPage (filtres : lib/events/params.ts)
 *   GET  /api/map?…                     → GeoJSON, un point par lieu
 *   GET  /api/suggest?q=                → suggestions de recherche
 *   POST /api/discover {q, lat?, lng?}  → « Je veux sortir… » (intention → résultats)
 *   GET/POST /api/saves, /api/attendance, /api/follows, /api/alerts/settings,
 *   /api/swipe, /api/drop, /api/taste-quiz, /api/profile/adn, /api/reviews,
 *   /api/artists/suggest, /api/artists/[key]/dates
 * Toutes acceptent `Authorization: Bearer <jeton Supabase>`.
 */
import type { CardEvent, EventPage } from '../events/types'

export type { CardEvent, EventPage }

export const API_VERSION = 1

// ─── Méta (catégories, ambiances, collections) ────────────────────────────

export interface MetaCategory {
  slug: string
  name: string
}

export interface MetaIntent {
  slug: string
  label: string
}

export interface MetaCollection {
  slug: string
  title: string
  tagline: string
  /** Paramètres à passer tels quels à /api/events (même schéma que les URL du site). */
  params: string
}

export interface MetaResponse {
  categories: MetaCategory[]
  intents: MetaIntent[]
  collections: MetaCollection[]
  arrondissements: string[]
}

// ─── Accueil ──────────────────────────────────────────────────────────────

export interface HomeSection {
  id: 'big-scenes' | 'expos' | 'last-chance' | 'free'
  kicker: string
  title: string
  layout: 'rail' | 'posters' | 'list'
  events: CardEvent[]
  /** Paramètres /api/events pour « Tout voir », ou null. */
  moreParams: string | null
}

export interface HomeResponse {
  generatedAt: string
  /** 3 à 4 idées pour ce soir, chacune avec sa raison (`reason`). */
  discover: { events: CardEvent[]; relaxed: string | null }
  /** Le choix de ce soir : 3 sorties fortes, différentes de `discover`. */
  picks: CardEvent[]
  tonightIsLate: boolean
  weekend: Array<{ key: string; label: string; events: CardEvent[] }>
  sections: HomeSection[]
}

// ─── Fiches ───────────────────────────────────────────────────────────────

export interface EventDetailV1 {
  id: string
  slug: string
  title: string
  description: string | null
  shortDesc: string | null
  imageUrl: string | null
  startDate: string
  endDate: string | null
  timeKnown: boolean
  priceMin: number
  priceMax: number
  priceStatus: 'free' | 'paid' | 'unknown'
  isFree: boolean
  saveCount: number
  attendanceCount: number
  category: { slug: string; name: string } | null
  venue: {
    id: string
    name: string
    slug: string
    address: string | null
    city: string
    zipCode: string | null
    arrondissement: string | null
    lat: number | null
    lng: number | null
    website: string | null
  } | null
  /** Libellés calculés comme sur le site (heure de Paris). */
  when: { primary: string; secondary: string | null }
  price: { label: string; tone: 'free' | 'paid' | 'unknown' }
  badge: string | null
  past: boolean
  cancelled: boolean
  soldOut: boolean
  /** Bouton principal : billetterie ou infos, null si aucun lien sûr. */
  cta: { url: string; label: string } | null
  /** Source lisible (« Ticketmaster », « Paris.fr »…). */
  sourceLabel: string
  /** Page web de la fiche (partage, liens universels). */
  webUrl: string
}

export interface EventResponse {
  event: EventDetailV1
  /** Artistes à suivre pour les alertes (concerts, festivals, soirées). */
  artists: Array<{ key: string; name: string }>
  /** Autres dates de la même œuvre (théâtre, spectacles…). */
  otherDates: Array<{ slug: string; startDate: string; venueName: string | null; venueSlug: string | null; arrondissement: string | null }>
  workSlug: string | null
  sameVenue: CardEvent[]
  similar: CardEvent[]
}

export interface VenueResponse {
  venue: {
    id: string
    slug: string
    name: string
    address: string | null
    city: string
    zipCode: string | null
    arrondissement: string | null
    lat: number | null
    lng: number | null
    website: string | null
    imageUrl: string | null
  }
  events: CardEvent[]
  total: number
  webUrl: string
}

export interface WorkDateV1 {
  id: string
  slug: string
  startDate: string
  endDate: string | null
  timeKnown: boolean
  price: { label: string; tone: 'free' | 'paid' | 'unknown' }
  bookingUrl: string | null
  venue: { name: string; slug: string; arrondissement: string | null; city: string | null } | null
}

export interface WorkResponse {
  kind: 'work' | 'film'
  slug: string
  title: string
  description: string | null
  imageUrl: string | null
  category: { slug: string; name: string } | null
  dates: WorkDateV1[]
  webUrl: string
}

// ─── Le Club ──────────────────────────────────────────────────────────────

export interface ClubMemberV1 {
  name: string | null
  avatarUrl: string | null
  memberSince: string | null
  xp: number
  level: number
  levelName: string
  nextLevel: { level: number; name: string; xp: number } | null
  progress: number
  /** Tous les badges, obtenus ou non, avec la progression vers chacun. */
  badges: Array<{ slug: string; name: string; emoji: string; desc: string; earned: boolean; value: number; goal: number }>
  archetype: string | null
  upcomingSaved: number
}

export interface ClubResponse {
  member: ClubMemberV1 | null
  drop: { weekStart: string; events: CardEvent[]; personalized: boolean; archetype: string | null; ended: number }
  challenge: {
    slug: string
    title: string
    text: string
    goal: number
    progress: { value: number; goal: number; done: boolean } | null
    ideas: Array<{ slug: string; name: string; arrondissement: string | null }>
  }
  topThisWeek: Array<{ event: CardEvent; saves: number; attendances: number }>
  mostViewed: Array<{ event: CardEvent; count: number }>
  mostSaved: Array<{ event: CardEvent; count: number }>
  lovedPast: Array<{ event: CardEvent; avgRating: number; reviews: number }>
}

// ─── Profil ───────────────────────────────────────────────────────────────

export interface MeResponse {
  id: string
  email: string | null
  name: string | null
  avatarUrl: string | null
  providers: string[]
  onboarded: boolean
  saved: { upcoming: CardEvent[]; past: CardEvent[] }
  attending: CardEvent[]
  follows: Array<{ id: string; kind: 'artist' | 'venue'; label: string; term: string | null; venueSlug: string | null }>
  newForYou: number
  alerts: {
    emailEnabled: boolean
    pushEnabled: boolean
    notifyNewDate: boolean
    notifyOnSale: boolean
    notifyReminder: boolean
    notifyDrop: boolean
  }
}

// ─── Notifications ────────────────────────────────────────────────────────

export interface PushRegisterBody {
  /** Jeton Expo : ExponentPushToken[…] */
  token: string
  platform: 'ios' | 'android'
}

/** Données jointes à chaque notification : le chemin web, que l'appli traduit en écran. */
export interface PushData {
  url: string
  kind: 'alert' | 'drop'
}
