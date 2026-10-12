/**
 * « Alertes concerts » landing page content (/alertes-concerts): the FAQ is
 * shared by the page and its FAQPage JSON-LD (they must say the same thing).
 */
import { MAX_FOLLOWS } from './follows'

export const ALERTS_LANDING_PATH = '/alertes-concerts'

export interface FaqItem {
  q: string
  a: string
}

export const ALERTS_FAQ: FaqItem[] = [
  {
    q: 'C’est vraiment gratuit ?',
    a: 'Oui. Les alertes concerts sont gratuites : il suffit d’un compte Paname Club, créé en quelques secondes avec Google ou un lien envoyé par e-mail, sans mot de passe.',
  },
  {
    q: 'Quels concerts sont couverts ?',
    a: 'Les concerts référencés sur Paname Club, à Paris et en petite couronne : nous rassemblons chaque jour les agendas de billetteries et d’agendas culturels (Ticketmaster, Offi, OpenAgenda…) et des sites des salles. Nous ne connaissons pas tous les concerts : une date qui n’est pas listée sur Paname Club ne déclenche pas d’alerte.',
  },
  {
    q: 'Quand est-ce que je suis prévenu ?',
    a: 'Quand une nouvelle date de ton artiste apparaît sur Paname Club, quand la billetterie ouvre (lorsque la date d’ouverture est connue), et la veille des concerts pour lesquels tu as appuyé sur « J’y vais ».',
  },
  {
    q: 'Combien de messages vais-je recevoir ?',
    a: 'Uniquement quand il y a du nouveau pour tes artistes, et toujours regroupé en un seul message. Tu choisis les moments qui t’intéressent dans « Mes artistes ».',
  },
  {
    q: 'Mon artiste n’a aucune date annoncée, je peux quand même le suivre ?',
    a: 'Oui. Tape simplement son nom : on te prévient dès qu’une date est annoncée à Paris ou en petite couronne.',
  },
  {
    q: 'Est-ce que ça marche sur iPhone ?',
    a: 'Les alertes par e-mail marchent partout. Pour les notifications sur l’iPhone, Apple impose d’abord d’ajouter Paname Club à l’écran d’accueil (dans Safari : Partager, puis « Sur l’écran d’accueil »), puis de les activer depuis « Mes artistes » en ouvrant le site depuis cette icône. Sur Android et sur ordinateur, tu peux les activer directement dans le navigateur.',
  },
  {
    q: 'Combien d’artistes puis-je suivre ?',
    a: `Jusqu’à ${MAX_FOLLOWS} artistes et lieux au total. Tu peux en retirer à tout moment depuis « Mes artistes ».`,
  },
  {
    q: 'Comment me désinscrire ?',
    a: 'Chaque e-mail contient un lien de désinscription en un clic, sans avoir à te connecter. Tu peux aussi couper les e-mails ou les notifications dans « Mes artistes », ou demander la suppression de ton compte à contact@panameclub.fr. Tes données ne sont jamais revendues.',
  },
]

export function faqJsonLd(items: FaqItem[] = ALERTS_FAQ) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })),
  }
}
