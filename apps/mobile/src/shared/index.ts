/**
 * Modules partagés avec le site (apps/web/src/lib), lus en place : une seule
 * définition de « ce soir », du week-end, des prix et des catégories.
 * Ces fichiers sont purs (aucun import serveur) ; ne jamais y ajouter
 * `server-only`, Next ou la base sans casser l'appli.
 */
export {
  PARIS_TZ,
  parisParts,
  parisISODate,
  parisWeekStart,
  effectiveEnd,
  isLongRun,
  isOngoing,
  formatTime,
  formatDayLabel,
  formatLongDay,
  formatShortDay,
  formatWhen,
  formatFilmTimes,
  formatFullWhen,
  urgencyBadge,
  formatCountdown,
  formatMonthChip,
  formatMonthLong,
  parisMonthKey,
} from '../../../web/src/lib/paris-time'
export { hdImageUrl } from '../../../web/src/lib/images'
export { formatPrice, formatPriceShort, formatDistance, formatArrondissement, pluralize, safeUrl } from '../../../web/src/lib/format'
export { CATEGORIES, CATEGORY_BY_SLUG, INTENTS, ARRONDISSEMENTS } from '../../../web/src/lib/events/taxonomy'
export {
  QUIZ_QUESTIONS,
  QUIZ_CATEGORIES,
  QUICK_QUESTION_IDS,
  MIN_ANSWERS,
  ARCHETYPES,
  DIMENSIONS,
  DIMENSION_LABELS,
  scoreQuiz,
} from '../../../web/src/lib/taste-quiz-data'
export type { QuizAnswers, QuizQuestion, Archetype, TasteScores } from '../../../web/src/lib/taste-quiz-data'
export { buildEventParams } from '../../../web/src/lib/events/params'
export { containsBlockedWords, BLOCKED_REVIEW_MESSAGE } from '../../../web/src/lib/review-moderation'
export type { EventQuery } from '../../../web/src/lib/events/types'
export type * from '../../../web/src/lib/api-v1/contract'
export type * from '../../../web/src/lib/api-v2/contract'
