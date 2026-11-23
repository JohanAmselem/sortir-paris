/**
 * Liens universels (www.panameclub.fr/…) et liens panameclub:// : le chemin du
 * site devient l'écran de l'appli. Les pages retirées en 2.0 (/club, /drop,
 * /ce-soir, /match, /quiz…) ouvrent un écran qui existe, jamais « introuvable ».
 */
import { appPathForWebPath } from '@/lib/links'

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const url = new URL(path, 'https://www.panameclub.fr')
    const web = url.hostname.endsWith('panameclub.fr') || url.protocol === 'panameclub:'
    if (!web) return path
    // panameclub://evenements/x : l'hôte porte le premier segment.
    const pathname = url.protocol === 'panameclub:' ? `/${url.hostname}${url.pathname}` : url.pathname
    return appPathForWebPath(`${pathname}${url.search}`) ?? '/'
  } catch {
    return path
  }
}
