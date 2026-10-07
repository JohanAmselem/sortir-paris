export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.panameclub.fr').replace(/\/$/, '')
export const SITE_NAME = 'Paname Club'

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}
