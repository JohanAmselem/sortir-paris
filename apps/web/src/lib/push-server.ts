/**
 * Web Push sending (server only). VAPID keys from the environment:
 * VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…).
 */
import 'server-only'
import webpush from 'web-push'
import type { PushPayload } from './alerts'

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
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
  p256dh: string
  auth: string
}

/** 'ok', 'gone' (404 / 410: delete the subscription) or 'error'. */
export type PushResult = 'ok' | 'gone' | 'error'

export async function sendPush(target: PushTarget, payload: PushPayload): Promise<PushResult> {
  if (!pushConfigured()) return 'error'
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
