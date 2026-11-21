/**
 * Push sending (server only), two channels:
 * - Web Push (navigateur) : clés VAPID dans l'environnement
 *   (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT mailto:…) ;
 * - Expo Push (appli iOS / Android) : aucun réglage requis ; EXPO_ACCESS_TOKEN
 *   seulement si la « sécurité renforcée » des notifications est activée chez Expo.
 */
import 'server-only'
import webpush from 'web-push'
import type { PushPayload } from './alerts'

/** Web Push configured (VAPID keys present). */
export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

/**
 * App notifications: production only (VERCEL_ENV), or explicitly with
 * EXPO_PUSH_ENABLED=1 ; EXPO_PUSH_DISABLED=1 always wins. A preview deployment
 * wired to the production database must never notify real members.
 */
export function expoPushConfigured(): boolean {
  if (process.env.EXPO_PUSH_DISABLED === '1') return false
  return process.env.VERCEL_ENV === 'production' || process.env.EXPO_PUSH_ENABLED === '1'
}

let configured = false
function configure() {
  if (configured) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:contact@panameclub.fr',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  configured = true
}

export interface PushTarget {
  endpoint: string
  p256dh: string | null
  auth: string | null
  /** 'web' (default) or 'expo' (mobile app token in `endpoint`). */
  kind?: 'web' | 'expo'
}

/** 'ok', 'gone' (404 / 410 / DeviceNotRegistered: delete the subscription) or 'error'. */
export type PushResult = 'ok' | 'gone' | 'error'

/** Can this target receive a notification with the current configuration? */
export function pushTargetUsable(t: Pick<PushTarget, 'kind'>): boolean {
  return t.kind === 'expo' ? expoPushConfigured() : pushConfigured()
}

export async function sendPush(target: PushTarget, payload: PushPayload, kind: 'alert' | 'drop' = 'alert'): Promise<PushResult> {
  if (target.kind === 'expo') return sendExpoPush(target.endpoint, payload, kind)
  if (!pushConfigured() || !target.p256dh || !target.auth) return 'error'
  configure()
  try {
    await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify(payload), {
      TTL: 24 * 3600,
      timeout: 8000,
    })
    return 'ok'
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) return 'gone'
    console.error('[push] send failed', status ?? err)
    return 'error'
  }
}

// ── Expo Push ──────────────────────────────────────────────────────────────

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/

export function isExpoPushToken(token: string): boolean {
  return EXPO_TOKEN_RE.test(token)
}

interface ExpoTicket {
  status: 'ok' | 'error'
  message?: string
  details?: { error?: string }
}

/** Ticket Expo → résultat commun. DeviceNotRegistered = appli désinstallée ou notifications refusées. */
export function expoTicketResult(ticket: ExpoTicket | undefined): PushResult {
  if (!ticket) return 'error'
  if (ticket.status === 'ok') return 'ok'
  if (ticket.details?.error === 'DeviceNotRegistered') return 'gone'
  return 'error'
}

export async function sendExpoPush(token: string, payload: PushPayload, kind: 'alert' | 'drop' = 'alert'): Promise<PushResult> {
  if (!expoPushConfigured()) return 'error'
  if (!isExpoPushToken(token)) return 'gone'
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`
  const message = {
    to: token,
    title: payload.title,
    body: payload.body,
    data: { url: payload.url, kind },
    sound: 'default',
    priority: 'high',
    ttl: 24 * 3600,
    channelId: kind === 'drop' ? 'drop' : 'alertes',
  }
  try {
    const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify([message]), signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
      console.error('[push] expo status', res.status)
      return 'error'
    }
    const json = (await res.json()) as { data?: ExpoTicket[] }
    const result = expoTicketResult(json.data?.[0])
    if (result === 'error') console.error('[push] expo ticket', json.data?.[0]?.message ?? 'inconnu')
    return result
  } catch (err) {
    console.error('[push] expo send failed', err instanceof Error ? err.message : err)
    return 'error'
  }
}
