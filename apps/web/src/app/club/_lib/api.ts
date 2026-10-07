/**
 * Shared helpers for the Club API routes (auth, validation, rate limits,
 * consistent French JSON errors). Never leaks internal error details.
 */
import 'server-only'
import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { User } from '@supabase/supabase-js'
import { db, users } from '@sortir/db'
import { createClient } from '@/lib/supabase/server'
import { clientIp, rateLimit } from '@/lib/rate-limit'

/** Any 8-4-4-4-12 hex id (Postgres uuid accepts all of them, not only RFC v4). */
export const idSchema = z.guid({ message: 'Identifiant invalide' })

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status })
}

export const errors = {
  unauthorized: () => jsonError(401, 'Connecte-toi pour continuer.'),
  badRequest: (msg = 'Requête invalide.') => jsonError(400, msg),
  notFound: (msg = 'Introuvable.') => jsonError(404, msg),
  tooMany: (retryAfter: number) =>
    NextResponse.json(
      { error: 'Trop de requêtes, réessaie dans un instant.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, retryAfter)) } }
    ),
  server: () => jsonError(500, 'Une erreur est survenue, réessaie dans un instant.'),
}

/** Current Supabase user (validated with the auth server via getUser), or null. */
export async function getSessionUser(): Promise<User | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user ?? null
  } catch {
    return null
  }
}

/** Make sure the public.users row exists (FK target of saves, swipes…). */
export async function ensureUserRow(user: User): Promise<void> {
  if (!user.email) return
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null)
  await db
    .insert(users)
    .values({
      id: user.id,
      email: user.email,
      name: str(meta.full_name) ?? str(meta.name) ?? user.email.split('@')[0] ?? null,
      avatarUrl: str(meta.avatar_url) ?? str(meta.picture),
      onboarded: false,
    })
    .onConflictDoNothing()
}

/** Rate-limit by IP (+ optional user) for a route. Returns a 429 response or null. */
export function limit(request: Request, route: string, max: number, windowMs: number, userId?: string | null) {
  const key = `${route}:${userId ?? clientIp(request.headers)}`
  const r = rateLimit(key, max, windowMs)
  return r.ok ? null : errors.tooMany(r.retryAfter)
}

/** Parse + validate a JSON body. Returns the data or a 400 response. */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { ok: false, response: errors.badRequest('Corps de requête JSON invalide.') }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const msg = first?.message && !first.message.startsWith('Invalid') ? first.message : 'Données invalides.'
    return { ok: false, response: errors.badRequest(msg) }
  }
  return { ok: true, data: parsed.data }
}

/** Validate a single query-string id. */
export function parseIdParam(value: string | null): string | null {
  const r = idSchema.safeParse(value ?? '')
  return r.success ? r.data : null
}

export { safeNext } from './safe-next'

/** Server pages: the current user, or redirect to /login?next=… */
export async function requireUser(nextPath: string): Promise<User> {
  const user = await getSessionUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`)
  return user
}
