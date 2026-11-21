/**
 * Les chemins du site deviennent des écrans de l'appli. Les routes de l'appli
 * reprennent les chemins du site (/evenements/…, /lieux/…), donc un lien
 * panameclub.fr partagé ou une notification ouvre le bon écran.
 */
import type { Href } from 'expo-router'

const ALIASES: Record<string, string> = {
  '/ce-soir': '/',
  '/compte': '/moi',
  '/compte/sauvegardes': '/moi',
  '/compte/adn': '/adn',
  '/compte/parametres': '/reglages',
  '/alertes-concerts': '/compte/artistes',
  '/evenements': '/explorer',
  '/collections': '/explorer',
}

/** Chemin web (« /evenements/x?y ») → route de l'appli ; null si l'appli n'a pas d'écran. */
export function appRouteForWebPath(raw: string): Href | null {
  let path: string
  try {
    path = new URL(raw, 'https://www.panameclub.fr').pathname.replace(/\/+$/, '') || '/'
  } catch {
    return null
  }
  if (ALIASES[path]) return ALIASES[path] as Href
  if (/^\/(evenements|lieux|oeuvres|films)\/[^/]+$/.test(path)) return path as Href
  if (['/', '/drop', '/club', '/match', '/quiz', '/carte', '/explorer', '/moi', '/adn', '/reglages', '/compte/artistes'].includes(path)) return path as Href
  return null
}

/** URL publique d'un écran (pour partager). */
export function webUrl(path: string): string {
  return `https://www.panameclub.fr${path}`
}
