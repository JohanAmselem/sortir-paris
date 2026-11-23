/**
 * Les chemins du site deviennent des écrans de l'appli. Les routes de l'appli
 * reprennent les chemins du site (/evenements/…, /lieux/…), donc un lien
 * panameclub.fr partagé ou une notification ouvre le bon écran.
 */
import type { Href } from 'expo-router'

const ALIASES: Record<string, string> = {
  '/ce-soir': '/',
  '/ce-week-end': '/agenda',
  '/gratuit': '/agenda',
  '/compte': '/mes-sorties',
  '/compte/sauvegardes': '/mes-sorties',
  '/mes-sorties': '/mes-sorties',
  '/compte/parametres': '/reglages',
  '/alertes-concerts': '/compte/artistes',
  '/evenements': '/agenda',
  '/agenda': '/agenda',
  '/explorer': '/agenda',
  '/collections': '/agenda',
  '/autour-de-moi': '/carte',
  // Le Club n'existe plus (2.0) : ses liens et le Drop du lundi ouvrent l'accueil.
  '/club': '/',
  '/drop': '/',
  '/match': '/',
  '/quiz': '/',
  '/top': '/',
  '/compte/adn': '/mes-sorties',
  '/moi': '/mes-sorties',
}

/** Chemin web (« /evenements/x?y ») → route de l'appli ; null si l'appli n'a pas d'écran. */
export function appRouteForWebPath(raw: string): Href | null {
  let path: string
  let search = ''
  try {
    const u = new URL(raw, 'https://www.panameclub.fr')
    path = u.pathname.replace(/\/+$/, '') || '/'
    search = u.search.replace(/^\?/, '')
  } catch {
    return null
  }
  // Pages mois de l'agenda : /agenda/2027-03 et /agenda/2027-03/concerts.
  const month = /^\/agenda\/(\d{4}-\d{2})(?:\/([a-z-]+))?$/.exec(path)
  if (month) return { pathname: '/agenda', params: { p: `when=${month[1]}${month[2] ? `&cat=${month[2]}` : ''}` } } as Href
  if (/^\/categories\/[a-z-]+$/.test(path)) return { pathname: '/agenda', params: { p: `cat=${path.split('/')[2]}` } } as Href
  if (ALIASES[path] === '/agenda') return (search ? { pathname: '/agenda', params: { p: search } } : '/agenda') as Href
  if (ALIASES[path]) return ALIASES[path] as Href
  if (/^\/(evenements|lieux|oeuvres|films)\/[^/]+$/.test(path)) return path as Href
  if (['/', '/carte', '/reglages', '/compte/artistes'].includes(path)) return path as Href
  return null
}

/** URL publique d'un écran (pour partager). */
export function webUrl(path: string): string {
  return `https://www.panameclub.fr${path}`
}
