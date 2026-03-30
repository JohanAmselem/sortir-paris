import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(cents: number): string {
  if (cents === 0) return 'Gratuit'
  return `${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}€`
}

export function formatPriceRange(min: number, max: number, isFree: boolean): string {
  if (isFree) return 'Gratuit'
  if (min === max) return formatPrice(min)
  return `${formatPrice(min)} — ${formatPrice(max)}`
}

export function formatEventDate(date: Date): string {
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
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  if (date) {
    const d = new Date(date)
    slug += `-${d.toISOString().slice(0, 10)}`
  }

  return slug
}
