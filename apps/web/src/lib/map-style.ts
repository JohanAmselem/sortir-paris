/**
 * Style des cartes Mapbox (carte interactive et plans statiques). Mapbox ne lit
 * pas les variables CSS : la carte interactive les lit à l'exécution
 * (`themeColor`), les plans statiques reprennent le jeton --color-accent-strong.
 */
export const MAPBOX_STYLE_ID = 'mapbox/dark-v11'
export const MAPBOX_STYLE_URL = `mapbox://styles/${MAPBOX_STYLE_ID}`

/** Même valeur que --color-accent-strong (globals.css), pour l'épingle des plans statiques. */
export const STATIC_PIN = '7c4dff'

/** Plan statique sombre centré sur un lieu. */
export function staticMapUrl(lat: number, lng: number, size: string, token: string, zoom = 14.5): string {
  return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE_ID}/static/pin-l+${STATIC_PIN}(${lng},${lat})/${lng},${lat},${zoom},0/${size}@2x?access_token=${token}`
}

/** Couleur d'un jeton du thème (« --color-accent »), lue dans la feuille de style. */
export function themeColor(name: string): string {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
