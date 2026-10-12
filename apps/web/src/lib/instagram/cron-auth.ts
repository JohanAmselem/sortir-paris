import { timingSafeEqual } from 'crypto'

/** Bearer CRON_SECRET, compared in constant time (same rule as /api/cron/alerts). */
export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}
