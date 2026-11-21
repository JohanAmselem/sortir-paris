/**
 * Notification « Ton Drop de la semaine » (lundi matin), envoyée seulement à
 * l'appli (jetons Expo), aux membres qui ont le push et le Drop activés.
 *
 * Jamais deux fois : chaque passage RÉSERVE d'abord les membres (UPDATE …
 * drop_notified_week = semaine … RETURNING), puis n'envoie qu'à ceux réservés ;
 * deux passages simultanés ne peuvent pas réserver le même membre.
 * Personne d'oublié : le cron repasse toutes les 10 minutes le lundi matin
 * (vercel.json), par lots, dans un ordre stable ; un membre dont tous les
 * envois ont échoué est libéré pour le passage suivant.
 */
import 'server-only'
import { and, asc, eq, inArray, isNull, lt, ne, notInArray, or, sql } from 'drizzle-orm'
import { alertSettings, db, pushSubscriptions } from '@sortir/db'
import { getMemberDrop } from '@/app/club/_lib/drop'
import { parisWeekStart } from '@/lib/paris-time'
import { expoPushConfigured, sendPush } from './push-server'
import type { PushPayload } from './alerts'

const BATCH = 150
const TIME_BUDGET_MS = 240_000
/** Appareils qui n'ont pas rouvert l'appli depuis 90 jours : oubliés. */
const STALE_DEVICE_DAYS = 90

export interface DropPushStats {
  ok: boolean
  dryRun: boolean
  weekStart: string
  candidates: number
  reserved: number
  sent: number
  failed: number
  released: number
  removed: number
  staleRemoved: number
  emptyDrops: number
  stoppedEarly: boolean
  reason?: string
}

/** Texte de la notification à partir des idées du Drop. */
export function dropPushPayload(titles: string[]): PushPayload {
  const shown = titles.slice(0, 2)
  const body = shown.length
    ? `${shown.join(' · ')}${titles.length > shown.length ? ` et ${titles.length - shown.length} autre${titles.length - shown.length > 1 ? 's' : ''}` : ''}`
    : 'Cinq idées de sorties choisies pour toi cette semaine.'
  return { title: 'Ton Drop de la semaine est là', body: body.slice(0, 180), url: '/drop' }
}

export async function runDropPush(opts: { dryRun: boolean; now?: Date }): Promise<DropPushStats> {
  const started = Date.now()
  const now = opts.now ?? new Date()
  const weekStart = parisWeekStart(now)
  const stats: DropPushStats = {
    ok: true,
    dryRun: opts.dryRun,
    weekStart,
    candidates: 0,
    reserved: 0,
    sent: 0,
    failed: 0,
    released: 0,
    removed: 0,
    staleRemoved: 0,
    emptyDrops: 0,
    stoppedEarly: false,
  }
  if (!expoPushConfigured()) return { ...stats, ok: false, reason: 'Notifications de l’appli désactivées hors production (EXPO_PUSH_ENABLED / VERCEL_ENV).' }

  if (!opts.dryRun) {
    const stale = await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.kind, 'expo'),
          lt(pushSubscriptions.lastSeenAt, sql`now() - make_interval(days => ${STALE_DEVICE_DAYS})`)
        )
      )
      .returning({ id: pushSubscriptions.id })
    stats.staleRemoved = stale.length
  }

  const notYetThisWeek = or(isNull(alertSettings.dropNotifiedWeek), ne(alertSettings.dropNotifiedWeek, weekStart))
  const eligible = and(
    eq(alertSettings.pushEnabled, true),
    eq(alertSettings.notifyDrop, true),
    notYetThisWeek,
    sql`exists (select 1 from ${pushSubscriptions} where ${pushSubscriptions.userId} = ${alertSettings.userId} and ${pushSubscriptions.kind} = 'expo')`
  )

  // Membres libérés après un échec pendant CE passage : retentés au passage suivant, pas en boucle.
  const retryLater: string[] = []
  while (Date.now() - started < TIME_BUDGET_MS) {
    const where = retryLater.length ? and(eligible, notInArray(alertSettings.userId, retryLater)) : eligible
    const candidates = await db.select({ userId: alertSettings.userId }).from(alertSettings).where(where).orderBy(asc(alertSettings.userId)).limit(BATCH)
    stats.candidates += candidates.length
    if (opts.dryRun || !candidates.length) break

    // Réservation : seuls les membres effectivement passés à « cette semaine » par CE passage.
    const reserved = await db
      .update(alertSettings)
      .set({ dropNotifiedWeek: weekStart, updatedAt: sql`now()` })
      .where(and(inArray(alertSettings.userId, candidates.map((c) => c.userId)), notYetThisWeek))
      .returning({ userId: alertSettings.userId })
    stats.reserved += reserved.length
    if (!reserved.length) continue

    const ids = reserved.map((r) => r.userId)
    const devices = await db
      .select({ id: pushSubscriptions.id, userId: pushSubscriptions.userId, endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(and(inArray(pushSubscriptions.userId, ids), eq(pushSubscriptions.kind, 'expo')))
    const byUser = new Map<string, typeof devices>()
    for (const d of devices) byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d])

    for (const userId of ids) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        // Réservés mais pas traités : libérés pour le passage suivant.
        stats.stoppedEarly = true
        const rest = ids.slice(ids.indexOf(userId))
        await db.update(alertSettings).set({ dropNotifiedWeek: null }).where(inArray(alertSettings.userId, rest))
        stats.released += rest.length
        return stats
      }
      const drop = await getMemberDrop(userId).catch(() => null)
      if (!drop || !drop.events.length) {
        stats.emptyDrops++
        continue
      }
      const payload = dropPushPayload(drop.events.map((e) => e.title))
      const targets = byUser.get(userId) ?? []
      const results = await Promise.all(
        targets.map((t) => sendPush({ endpoint: t.endpoint, p256dh: null, auth: null, kind: 'expo' }, payload, 'drop').then((r) => ({ t, r })))
      )
      stats.sent += results.filter((x) => x.r === 'ok').length
      stats.failed += results.filter((x) => x.r === 'error').length
      const gone = results.filter((x) => x.r === 'gone').map((x) => x.t.id)
      if (gone.length) {
        await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone)).catch(() => {})
        stats.removed += gone.length
      }
      // Rien n'est parti à cause d'erreurs (et pas seulement d'appareils disparus) : nouvel essai au passage suivant.
      if (!results.some((x) => x.r === 'ok') && results.some((x) => x.r === 'error')) {
        await db.update(alertSettings).set({ dropNotifiedWeek: null }).where(eq(alertSettings.userId, userId))
        retryLater.push(userId)
        stats.released++
      }
    }
  }
  return stats
}
