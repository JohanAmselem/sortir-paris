/**
 * Editorial collections = named, timeless queries on the live catalogue.
 * Single source of truth for the homepage, /collections, the sitemap and SEO.
 */
import type { EventQuery } from './events/types'

export interface CollectionDef {
  slug: string
  title: string
  /** One line under the title. */
  tagline: string
  /** SEO intro (2–3 sentences, unique per page). */
  intro: string
  query: EventQuery
  /** Layout hint for the listing page. */
  layout: 'tiles' | 'posters'
}

export const COLLECTIONS: CollectionDef[] = [
  {
    slug: 'expos-du-moment',
    title: 'Les expos du moment',
    tagline: 'Ce qui est accroché aux murs de Paris en ce moment.',
    intro:
      'Toutes les expositions en cours à Paris, des grands musées aux galeries de quartier. Les dates de fin sont indiquées : les expositions qui ferment bientôt apparaissent avec un compte à rebours.',
    query: { categories: ['expos'], when: 'month', runsEndingWithinDays: 400 },
    layout: 'tiles',
  },
  {
    slug: 'sorties-gratuites',
    title: 'Gratuit cette semaine',
    tagline: 'Concerts, expos, rencontres : zéro euro, vraiment.',
    intro:
      'Les sorties gratuites à Paris pour les sept prochains jours. Seuls les événements explicitement gratuits sont listés : quand le prix est inconnu, nous ne l’affichons pas comme gratuit.',
    query: { free: true, when: 'week' },
    layout: 'posters',
  },
  {
    slug: 'concerts-jazz',
    title: 'Jazz à Paris',
    tagline: 'Clubs, caves et grandes salles.',
    intro:
      'Les concerts de jazz à Paris dans les prochaines semaines, des clubs historiques de la rue des Lombards aux scènes ouvertes et jam sessions.',
    query: { categories: ['concerts'], q: 'jazz', when: 'month' },
    layout: 'posters',
  },
  {
    slug: 'theatre-comedie',
    title: 'Théâtre & humour',
    tagline: 'Pièces, seul-en-scène, impro.',
    intro: 'Les pièces de théâtre, spectacles d’humour et soirées d’improvisation à voir à Paris cette semaine et les suivantes.',
    query: { categories: ['theatre', 'spectacles'], when: 'month' },
    layout: 'posters',
  },
  {
    slug: 'sorties-en-famille',
    title: 'En famille',
    tagline: 'Ateliers, contes, spectacles jeune public.',
    intro:
      'Des idées de sorties avec des enfants à Paris : ateliers, spectacles jeune public, contes et visites adaptées, repérés à partir des descriptions des organisateurs.',
    query: { intents: ['en-famille'], when: 'month' },
    layout: 'posters',
  },
  {
    slug: 'soirees-dansantes',
    title: 'On danse ce soir',
    tagline: 'Bals, DJ sets, guinguettes.',
    intro: 'Les soirées où l’on danse à Paris : bals, DJ sets, guinguettes et soirées festives, ce soir et ce week-end.',
    query: { intents: ['festif'], when: 'weekend' },
    layout: 'posters',
  },
  {
    slug: 'insolite',
    title: 'Insolite',
    tagline: 'Pour sortir des sentiers battus.',
    intro: 'Visites secrètes, expériences immersives, nocturnes et lieux méconnus : les sorties les plus originales de Paris en ce moment.',
    query: { intents: ['insolite'], when: 'month' },
    layout: 'posters',
  },
  {
    slug: 'en-amoureux',
    title: 'En amoureux',
    tagline: 'Jazz, danse, nocturnes : de quoi passer une belle soirée à deux.',
    intro: 'Une sélection de sorties à deux à Paris : concerts intimistes, danse, théâtre et nocturnes de musées.',
    query: { intents: ['en-amoureux'], when: 'week' },
    layout: 'posters',
  },
]

export const LEGACY_COLLECTION_SLUGS: Record<string, string> = {
  'expos-printemps': 'expos-du-moment',
}

export function getCollection(slug: string): CollectionDef | undefined {
  return COLLECTIONS.find((c) => c.slug === slug)
}
