import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(cents: number | null | undefined): string {
  if (!cents || cents === 0) return 'Gratuit'
  return `${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)} €`
}

export function formatPriceRange(
  min: number | null | undefined,
  max: number | null | undefined,
  isFree: boolean | null | undefined
): string {
  if (isFree) return 'Gratuit'
  if (!min && !max) return 'Prix non communiqué'
  if (!min || !max || min === max) return formatPrice(min || max)
  return `${formatPrice(min)} — ${formatPrice(max)}`
}

export function formatEventDate(date: Date | null | undefined): string {
  if (!date || isNaN(date.getTime())) return ''
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isTomorrow = date.toDateString() === tomorrow.toDateString()

  if (isToday) {
    return `Aujourd'hui · ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  }
  if (isTomorrow) {
    return `Demain · ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  }

  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function generateSlug(title: string, date?: string): string {
  let slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  if (date) {
    const d = new Date(date)
    slug += `-${d.toISOString().slice(0, 10)}`
  }

  return slug
}
