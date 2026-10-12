/**
 * Server-side validation of the pending-follow cookie (zod). Kept apart
 * from lib/pending-follow.ts so client bundles do not ship zod for it.
 */
import { z } from 'zod'
import { isValidArtistKey } from './artists'
import { isValidTerm, normalizeTerm, TERM_MAX } from './follows'
import { decodeCookieJson, type PendingFollow } from './pending-follow'

const label = z
  .string()
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1).max(160))

const pendingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('artist'), term: z.string().min(1).max(200), label }),
  z.object({ kind: z.literal('venue'), venueId: z.guid(), label }),
])

/**
 * The pending follow stored by a visitor, or null when absent, malformed or
 * not followable. Artist terms are normalized like POST /api/follows does.
 */
export function parsePendingFollow(raw: string | null | undefined): PendingFollow | null {
  const parsed = pendingSchema.safeParse(decodeCookieJson(raw))
  if (!parsed.success) return null
  const p = parsed.data
  if (p.kind === 'venue') return { kind: 'venue', venueId: p.venueId, label: p.label }
  const term = normalizeTerm(p.term).slice(0, TERM_MAX).trim()
  // Same rule as the API: a title term (3+ letters) or an artist key (2+).
  if (!isValidTerm(term) && !isValidArtistKey(term)) return null
  return { kind: 'artist', term, label: p.label }
}
