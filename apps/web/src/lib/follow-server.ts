/**
 * Creating a follow (server only), shared by POST /api/follows, the
 * « Alertes concerts » pending-follow funnel (auth callback, /api/follows/pending)
 * and the Spotify import (welcome e-mail only).
 *
 * The first alert of a member triggers a one-time « Ton alerte est activée »
 * e-mail, sent after the response (never blocks nor fails the follow).
 */
import 'server-only'
import { after, type NextResponse } from 'next/server'
import { and, count, eq } from 'drizzle-orm'
import type { User } from '@supabase/supabase-js'
import { alertSettings, db, userFollows, venues, withStatementTimeout } from '@sortir/db'
import { ensureUserRow } from '@/app/club/_lib/api'
import { getArtistDates } from '@/app/club/_lib/artists'
import { STATEMENT_TIMEOUT_MS } from './events/query'
import { MAX_FOLLOWS, TERM_MAX, isValidTerm, normalizeTerm } from './follows'
import { artistKey, isValidArtistKey } from './artists'
import { emailConfigured, sendEmail, unsubscribeApiUrl, unsubscribePageUrl } from './alerts-server'
import { renderWelcomeEmail, shouldSendWelcome, WELCOME_MAX_TARGETS, type WelcomeTarget } from './alerts-welcome'
import { absoluteUrl } from './site'
import { ACTIVATED_COOKIE, ACTIVATED_MAX_AGE, PENDING_FOLLOW_COOKIE, encodeCookieJson, type ActivatedResult } from './pending-follow'
import { parsePendingFollow } from './pending-follow-schema'

export type FollowInput = { kind: 'venue'; venueId: string } | { kind: 'artist'; term: string; label?: string }

export type FollowResult =
  | { ok: true; id: string | null; label: string; created: boolean }
  | { ok: false; status: 400 | 404; error: string }

/** Follow a venue (its canonical one) or an artist / work. Idempotent; keeps MAX_FOLLOWS. */
export async function createFollow(user: User, input: FollowInput): Promise<FollowResult> {
  let values: typeof userFollows.$inferInsert
  if (input.kind === 'venue') {
    const [v] = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
      tx
        .select({ id: venues.id, name: venues.name, canonicalId: venues.canonicalVenueId })
        .from(venues)
        .where(eq(venues.id, input.venueId))
        .limit(1)
    )
    if (!v) return { ok: false, status: 404, error: 'Lieu introuvable.' }
    let target = { id: v.id, name: v.name }
    // Merged venues: always follow the canonical one.
    if (v.canonicalId) {
      const [c] = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
        tx.select({ id: venues.id, name: venues.name }).from(venues).where(eq(venues.id, v.canonicalId!)).limit(1)
      )
      if (c) target = c
    }
    values = { userId: user.id, kind: 'venue', venueId: target.id, term: null, label: target.name.slice(0, 160) }
  } else {
    const term = normalizeTerm(input.term).slice(0, TERM_MAX).trim()
    // Artist keys (lib/artists.ts) may be 2 characters long ("MØ" → "mo").
    if (!isValidTerm(term) && !isValidArtistKey(term)) return { ok: false, status: 400, error: 'Ce nom est trop court pour être suivi.' }
    const label = (input.label ?? input.term).replace(/\s+/g, ' ').trim().slice(0, 160)
    values = { userId: user.id, kind: 'artist', venueId: null, term, label }
  }

  const [counted, existing] = await withStatementTimeout(STATEMENT_TIMEOUT_MS, async (tx) => [
    await tx.select({ n: count() }).from(userFollows).where(eq(userFollows.userId, user.id)),
    await tx
      .select({ id: userFollows.id })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.userId, user.id),
          eq(userFollows.kind, values.kind),
          values.kind === 'venue' ? eq(userFollows.venueId, values.venueId!) : eq(userFollows.term, values.term!)
        )
      )
      .limit(1),
  ] as const)
  if (existing[0]) return { ok: true, id: existing[0].id, label: values.label, created: false }
  if (Number(counted[0]?.n ?? 0) >= MAX_FOLLOWS) {
    return { ok: false, status: 400, error: `Tu suis déjà ${MAX_FOLLOWS} lieux et artistes : retire-en un depuis ton compte.` }
  }
  await ensureUserRow(user)
  const inserted = await db.insert(userFollows).values(values).onConflictDoNothing().returning({ id: userFollows.id })
  const created = inserted.length > 0
  if (created) scheduleWelcomeEmail(user)
  return { ok: true, id: inserted[0]?.id ?? null, label: values.label, created }
}

/** Run the welcome e-mail after the response (fire-and-forget outside a request scope). */
export function scheduleWelcomeEmail(user: Pick<User, 'id' | 'email'>): void {
  if (!emailConfigured() || !user.email) return
  const task = () =>
    sendWelcomeIfFirst(user.id, user.email!).catch((err) => {
      console.error('[welcome] failed', err)
    })
  try {
    after(task)
  } catch {
    void task()
  }
}

/**
 * « Ton alerte est activée », once per member. The alert_settings row is the
 * "welcome sent" marker (no schema change): it is created (claimed) just
 * before sending, so two follows in a row cannot send two e-mails, and
 * removed again if the e-mail could not be sent.
 */
export async function sendWelcomeIfFirst(userId: string, email: string, now = new Date()): Promise<boolean> {
  if (!emailConfigured()) return false
  const [settingsRows, follows] = await withStatementTimeout(STATEMENT_TIMEOUT_MS, async (tx) => [
    await tx.select({ userId: alertSettings.userId }).from(alertSettings).where(eq(alertSettings.userId, userId)).limit(1),
    await tx
      .select({ kind: userFollows.kind, term: userFollows.term, label: userFollows.label, createdAt: userFollows.createdAt })
      .from(userFollows)
      .where(eq(userFollows.userId, userId))
      .limit(MAX_FOLLOWS + 1),
  ] as const)
  if (!shouldSendWelcome({ hasSettingsRow: settingsRows.length > 0, followCreatedAts: follows.map((f) => f.createdAt), now })) return false

  const claimed = await db.insert(alertSettings).values({ userId }).onConflictDoNothing().returning({ token: alertSettings.unsubscribeToken })
  const token = claimed[0]?.token
  if (!token) return false

  try {
    // Artists first (most recent first), then venues.
    const ordered = [...follows].sort(
      (a, b) => Number(a.kind === 'venue') - Number(b.kind === 'venue') || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    const shown = ordered.slice(0, WELCOME_MAX_TARGETS)
    const keys = shown.filter((f) => f.kind === 'artist' && f.term).map((f) => artistKey(f.term!))
    const dates = await getArtistDates(keys).catch(() => new Map())
    const targets: WelcomeTarget[] = ordered.map((f) => ({
      kind: f.kind,
      label: f.label,
      dates: f.kind === 'artist' && f.term ? (dates.get(artistKey(f.term)) ?? []) : [],
    }))
    const mail = renderWelcomeEmail(
      targets,
      {
        absoluteUrl,
        settingsUrl: absoluteUrl('/compte/artistes'),
        unsubscribeUrl: unsubscribePageUrl(token),
        landingUrl: absoluteUrl('/alertes-concerts'),
      },
      now
    )
    const ok = await sendEmail(email, mail.subject, mail.html, mail.text, unsubscribeApiUrl(token))
    if (!ok) await releaseClaim(userId, token)
    return ok
  } catch (err) {
    await releaseClaim(userId, token)
    throw err
  }
}

/**
 * « Alertes concerts » funnel: create the follow a visitor asked for before
 * logging in (cookie written by lib/pending-follow.ts). Null when there is no
 * valid pending follow; otherwise what the confirmation banner shows.
 */
export async function consumePendingFollow(user: User, raw: string | null | undefined): Promise<ActivatedResult | null> {
  const pending = parsePendingFollow(raw)
  if (!pending) return null
  try {
    const r = await createFollow(
      user,
      pending.kind === 'venue' ? { kind: 'venue', venueId: pending.venueId } : { kind: 'artist', term: pending.term, label: pending.label }
    )
    return r.ok ? { ok: true, label: r.label } : { ok: false, label: pending.label, error: r.error }
  } catch (err) {
    console.error('[pending follow] failed', err)
    return { ok: false, label: pending.label, error: 'L’alerte n’a pas pu être créée. Réessaie depuis la page.' }
  }
}

const cookieBase = { path: '/', sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production' }

/** Clear the pending follow and hand the outcome to the destination page (read by the banner, not httpOnly). */
export function applyActivatedCookies(res: NextResponse, result: ActivatedResult | null, hadPending: boolean): void {
  if (hadPending) res.cookies.set(PENDING_FOLLOW_COOKIE, '', { ...cookieBase, maxAge: 0 })
  if (result) res.cookies.set(ACTIVATED_COOKIE, encodeCookieJson(result), { ...cookieBase, maxAge: ACTIVATED_MAX_AGE })
}

/** Not sent: drop the marker row we just created (defaults only), so a later follow can retry. */
async function releaseClaim(userId: string, token: string): Promise<void> {
  try {
    await db.delete(alertSettings).where(and(eq(alertSettings.userId, userId), eq(alertSettings.unsubscribeToken, token)))
  } catch (err) {
    console.error('[welcome] release failed', err)
  }
}
