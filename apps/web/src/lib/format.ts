/** Price & misc formatting. Prices are stored in centimes. */

export interface PriceInfo {
  priceMin: number
  priceMax: number
  priceStatus?: 'free' | 'paid' | 'unknown' | null
  isFree?: boolean | null
}

function euros(cents: number): string {
  const v = cents / 100
  return Number.isInteger(v) ? `${v} €` : `${v.toFixed(2).replace('.', ',')} €`
}

export type PriceTone = 'free' | 'paid' | 'unknown'

/** "Gratuit", "12 €", "Dès 12 €", "12 – 35 €", "Prix non communiqué". */
export function formatPrice(p: PriceInfo): { label: string; tone: PriceTone } {
  const status = p.priceStatus ?? (p.isFree ? 'free' : p.priceMax > 0 || p.priceMin > 0 ? 'paid' : 'unknown')
  if (status === 'free') return { label: 'Gratuit', tone: 'free' }
  const min = Math.min(p.priceMin, p.priceMax || p.priceMin)
  const max = Math.max(p.priceMin, p.priceMax)
  if (status === 'unknown' || max <= 0) return { label: 'Prix non communiqué', tone: 'unknown' }
  if (min <= 0 || min === max) return { label: euros(max), tone: 'paid' }
  if (max > min * 3) return { label: `Dès ${euros(min)}`, tone: 'paid' }
  return { label: `${euros(min).replace(' €', '')} – ${euros(max)}`, tone: 'paid' }
}

/** Compact label for cards ("Gratuit", "Dès 12 €", "" when unknown). */
export function formatPriceShort(p: PriceInfo): string {
  const { label, tone } = formatPrice(p)
  if (tone === 'unknown') return ''
  if (tone === 'free') return label
  if (label.includes('–')) return `Dès ${label.split(' –')[0]} €`
  return label
}

export function formatDistance(km: number | null | undefined): string | null {
  if (km == null) return null
  if (km < 1) return `${Math.max(1, Math.round((km * 1000) / 50) * 50)} m`
  return `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`
}

/** "1er arr." / "11e arr." */
export function formatArrondissement(arr: string | null | undefined): string | null {
  if (!arr) return null
  return `${arr} arr.`
}

export function pluralize(n: number, one: string, many: string): string {
  return `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`
}

/** Human, non-technical name for a data source. */
export const SOURCE_LABELS: Record<string, string> = {
  paris_opendata: 'Que faire à Paris (Ville de Paris)',
  openagenda: 'OpenAgenda',
  eventbrite: 'Eventbrite',
  allocine: 'AlloCiné',
  infoconcert: 'Infoconcert',
  parisjazzclub: 'Paris Jazz Club',
  parismusees: 'Paris Musées',
  lebonbon: 'Le Bonbon',
  billetreduc: 'BilletRéduc',
  fnacspectacles: 'Fnac Spectacles',
  theatreonline: 'TheatreOnline',
  offi: 'Offi',
  timeout: 'Time Out Paris',
  sortiraparis: 'Sortir à Paris',
  shotgun: 'Shotgun',
  dice: 'DICE',
  meetup: 'Meetup',
  mapado: 'Mapado',
  bandsintown: 'Bandsintown',
  newmorning: 'New Morning',
  quefaire_paris: 'Que faire à Paris',
  paris_fr: 'paris.fr',
}

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Only http(s) URLs are rendered as links. */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}
