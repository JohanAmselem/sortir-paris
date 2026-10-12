/**
 * « Alertes concerts » funnel for visitors (pure, client and server).
 *
 * A visitor who taps « Créer mon alerte » / « Suivre » is not asked to start
 * again after logging in: the intent is kept in a short-lived first-party
 * cookie, consumed by /api/auth/callback (Google and magic link) or, as a
 * fallback, by POST /api/follows/pending from the destination page. The
 * outcome is handed to the page in a second short cookie, read by the banner.
 */
import { safeNext } from '@/app/club/_lib/safe-next'

export const PENDING_FOLLOW_COOKIE = 'pc_pending_follow'
export const ACTIVATED_COOKIE = 'pc_alert_activated'
/** One hour to log in (magic link mails can be slow). */
export const PENDING_FOLLOW_MAX_AGE = 3600
/** The banner must survive the onboarding detour. */
export const ACTIVATED_MAX_AGE = 900
export const ACTIVATED_PARAM = 'activated'
/** Cookie values are at most this long (a browser cookie is 4 kB). */
export const PENDING_FOLLOW_MAX_LENGTH = 1000

export type PendingFollow =
  | { kind: 'artist'; term: string; label: string }
  | { kind: 'venue'; venueId: string; label: string }

/** What the banner shows after login. */
export type ActivatedResult = { ok: true; label: string } | { ok: false; label: string; error: string }

export function encodeCookieJson(value: unknown): string {
  return encodeURIComponent(JSON.stringify(value))
}

/** JSON from a cookie value, or null (never throws). */
export function decodeCookieJson(raw: string | null | undefined): unknown {
  if (!raw || raw.length > PENDING_FOLLOW_MAX_LENGTH * 3) return null
  try {
    return JSON.parse(decodeURIComponent(raw))
  } catch {
    return null
  }
}

/** `path` (same-site, with its query) plus ?activated=1. */
export function withActivatedParam(path: string): string {
  const safe = safeNext(path, '/alertes-concerts')
  const url = new URL(safe, 'https://x.invalid')
  url.searchParams.set(ACTIVATED_PARAM, '1')
  return url.pathname + url.search + url.hash
}

/** `path` without ?activated=1 (to clean the address bar once the banner is shown). */
export function withoutActivatedParam(path: string): string {
  const url = new URL(safeNext(path), 'https://x.invalid')
  url.searchParams.delete(ACTIVATED_PARAM)
  return url.pathname + url.search + url.hash
}

/** Login page that brings the visitor back to `returnTo` with ?activated=1. */
export function loginUrlForPending(returnTo: string): string {
  return '/login?next=' + encodeURIComponent(withActivatedParam(returnTo))
}

/** `document.cookie` assignment for a pending follow. */
export function pendingFollowCookie(p: PendingFollow, secure: boolean): string {
  const value = encodeCookieJson({ ...p, label: p.label.replace(/\s+/g, ' ').trim().slice(0, 160) })
  return `${PENDING_FOLLOW_COOKIE}=${value}; Max-Age=${PENDING_FOLLOW_MAX_AGE}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`
}

/** The banner's cookie, or null when absent or malformed. */
export function parseActivated(raw: string | null | undefined): ActivatedResult | null {
  const v = decodeCookieJson(raw) as { ok?: unknown; label?: unknown; error?: unknown } | null
  if (!v || typeof v !== 'object' || typeof v.label !== 'string') return null
  const label = v.label.replace(/\s+/g, ' ').trim().slice(0, 160)
  if (!label) return null
  if (v.ok === true) return { ok: true, label }
  if (v.ok === false && typeof v.error === 'string' && v.error.trim()) return { ok: false, label, error: v.error.trim().slice(0, 200) }
  return null
}

/**
 * Browser only: remember what the visitor wanted to follow and send them to
 * the login page; they come back to `returnTo` (default: this page) with the
 * alert already created.
 */
export function startPendingFollow(p: PendingFollow, returnTo?: string): void {
  if (typeof window === 'undefined') return
  document.cookie = pendingFollowCookie(p, window.location.protocol === 'https:')
  const here = returnTo ?? window.location.pathname + window.location.search
  window.location.href = loginUrlForPending(withoutActivatedParam(here))
}

/** Read one cookie from a `document.cookie`-style string. */
export function readCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return null
}
