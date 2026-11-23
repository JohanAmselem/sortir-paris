/**
 * Contrat de l'API de l'appli 2.0 et du site refondu (`/api/v2/*`).
 *
 * Fichier PUR : seulement des types (l'appli Expo l'importe tel quel). Les routes
 * vérifient leurs réponses avec `satisfies`.
 *
 * Les routes `/api/v1/*` restent inchangées : l'appli 1.0 des stores les appelle.
 */
import type { CardEvent } from '../events/types'

export type HomeWhen = 'tonight' | 'tomorrow' | 'weekend'

export interface EnvieTile {
  slug: 'concerts' | 'scene' | 'expos' | 'soirees' | 'famille' | 'gratuit'
  label: string
  /** Paramètres de l'Agenda (même schéma que les URL du site). */
  params: string
  imageUrl: string | null
}

export interface HomeV2Response {
  generatedAt: string
  when: HomeWhen
  /** « Ce soir », « Demain », « Ce week-end » */
  whenLabel: string
  /** Nombre de sorties dans la fenêtre (hors séances de cinéma comptées par film). */
  count: number
  /** Notre choix : 3 à 5 sorties fortes, chacune avec sa raison (`reason`). */
  picks: CardEvent[]
  envies: EnvieTile[]
  weekend: CardEvent[]
  /** Les grosses dates : grandes salles, des semaines aux mois à venir, triées par date. */
  bigDates: CardEvent[]
  expos: CardEvent[]
}

export interface MonthCountV2 {
  /** YYYY-MM */
  key: string
  /** « Mars », « Janv. 27 » */
  label: string
  n: number
}

export interface DayCountV2 {
  /** YYYY-MM-DD */
  key: string
  n: number
}

export interface AgendaUnderstood {
  /** Valeur `when` comprise (choisie ou lue dans la recherche), null = tout le futur. */
  when: string | null
  whenLabel: string | null
  /** Texte réellement cherché après lecture des dates et des filtres. */
  text: string | null
  categories: string[]
  free: boolean
}

export interface AgendaArtist {
  key: string
  name: string
  dates: number
}

export interface AgendaVenue {
  name: string
  slug: string
  area: string | null
}

export interface AgendaResponse {
  understood: AgendaUnderstood
  events: CardEvent[]
  /** À repasser en `cursor` pour la suite ; null à la fin. */
  nextCursor: string | null
  /** Pagination par décalage (tri par distance) : décalage suivant, ou null. */
  nextOffset: number | null
  /** Présents sur la première page seulement : */
  total?: number
  /** Expos et spectacles à l'affiche pendant la période (montrés à part). */
  ongoing?: CardEvent[]
  /** Les 18 prochains mois avec leur nombre de sorties (mêmes filtres). */
  months?: MonthCountV2[]
  /** Les jours du mois choisi (quand `when` est un mois). */
  days?: DayCountV2[]
  /** Quand il y a un texte : artistes et lieux qui correspondent. */
  artists?: AgendaArtist[]
  venues?: AgendaVenue[]
}
