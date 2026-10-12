/**
 * Instagram pipeline (server only).
 *   prepare(now)     the day before: drafts for tomorrow's schedule (preview in /admin/instagram)
 *   publishDue(now)  every 30 min: publishes the drafts whose time has come
 * Never twice the same post: (kind, theme, for_date) is unique, and a post is
 * claimed with a conditional UPDATE … WHERE status = 'draft' before any call.
 */
import 'server-only'
import { getSignatureVenueIds } from '@/lib/events/query'
import { parisISODate } from '@/lib/paris-time'
import { buildCaption, eventLine, hookInput } from './caption'
import {
  claimPost,
  getPost,
  loadCandidates,
  loadCredentials,
  loadDuePosts,
  loadEventStates,
  loadExclusions,
  markFailed,
  markPublished,
  releaseStuck,
  saveItems,
  saveRefreshedToken,
  setStatus,
  skipDraft,
  skipStaleDrafts,
  upsertDraft,
  type Credentials,
  type PostRow,
} from './data'
import { InstagramGraph } from './graph'
import { writeHook } from './hook'
import { slideUrl } from './media-url'
import { checkPhoto } from './photo'
import { PublishUncertainError, publishToInstagram, publishableIndexes } from './publish-flow'
import { addDays, eventWindow, planForDate, windowDateLabel, type PlannedPost } from './schedule'
import { buildItems, coverItem, isExcluded, selectEvents } from './select'
import { CAROUSEL_THEMES, STORY_THEMES, hashtagsFor, isCarouselTheme, isStoryTheme } from './themes'
import type { Candidate, Exclusion, PostItem } from './types'

export const MAX_ATTEMPTS = 3
/** A draft not published within 6 hours of its time is dropped (never posted late). */
const STALE_AFTER_MS = 6 * 3600_000
const STUCK_AFTER_MS = 15 * 60_000
/** Refresh the 60-day token when it expires within 10 days. */
const REFRESH_BEFORE_MS = 10 * 86400_000
/** Stop starting new posts before the function's maxDuration (300 s). */
const TIME_BUDGET_MS = 200_000

export const NOT_CONNECTED = 'Instagram non connecté'

// ── Prepare ─────────────────────────────────────────────────────────────────

export interface PreparedSummary {
  kind: string
  theme: string
  forDate: string
  scheduledAt: string
  result: 'written' | 'kept' | 'skipped' | 'dry'
  events: number
  photos?: number
  hook?: 'ai' | 'template'
  reason?: string
  titles?: string[]
}

async function checkPhotos(items: PostItem[], cache: Map<string, Promise<boolean>>): Promise<void> {
  await Promise.all(
    items.map(async (it) => {
      if (it.type !== 'event' || !it.image_url) return
      let p = cache.get(it.image_url)
      if (!p) {
        p = checkPhoto(it.image_url).then((r) => r.ok)
        cache.set(it.image_url, p)
      }
      it.image_ok = await p
      if (!it.image_ok) delete it.credit
    })
  )
}

async function prepareOne(
  plan: PlannedPost,
  ctx: { now: Date; dryRun: boolean; insertOnly: boolean; exclusions: Exclusion[]; signatureIds: string[]; candidates: Map<string, Promise<Candidate[]>>; photos: Map<string, Promise<boolean>> }
): Promise<PreparedSummary> {
  const base = { kind: plan.kind, theme: plan.theme, forDate: plan.forDate, scheduledAt: plan.scheduledAt.toISOString() }
  const tw = eventWindow(plan.window, plan.scheduledAt)
  const key = `${plan.window}|${plan.scheduledAt.toISOString()}`
  let pool = ctx.candidates.get(key)
  if (!pool) {
    pool = loadCandidates(tw, ctx.now, ctx.signatureIds)
    ctx.candidates.set(key, pool)
  }
  const picked = selectEvents(await pool, { window: plan.window, theme: plan.theme, timeWindow: tw, exclusions: ctx.exclusions, signatureIds: new Set(ctx.signatureIds) }, plan.kind)
  if (!picked.length) {
    const reason = 'Pas assez de sorties fiables'
    if (!ctx.dryRun && !ctx.insertOnly) await skipDraft(plan.kind, plan.theme, plan.forDate, reason)
    return { ...base, result: 'skipped', events: 0, reason }
  }

  const dateLabel = windowDateLabel(plan.window, tw)
  const headline = isCarouselTheme(plan.theme) ? CAROUSEL_THEMES[plan.theme].headline : CAROUSEL_THEMES.demain.headline
  const coverTheme = isStoryTheme(plan.theme) ? STORY_THEMES[plan.theme].label : 'La sélection'
  const items = buildItems(plan.kind, coverItem(headline, dateLabel, coverTheme), picked)
  const titles = picked.map((c) => c.title)
  if (ctx.dryRun) return { ...base, result: 'dry', events: picked.length, titles }

  await checkPhotos(items, ctx.photos)
  let caption: string | null = null
  let hookSource: 'ai' | 'template' | undefined
  if (plan.kind === 'carousel') {
    const hook = await writeHook(plan.theme, `${plan.theme}|${plan.forDate}`, hookInput(headline, dateLabel, items), { useAi: true })
    hookSource = hook.source
    caption = buildCaption({ hook: hook.hook, headline, dateLabel, items, hashtags: hashtagsFor(plan.theme) })
  }
  const result = await upsertDraft({ kind: plan.kind, theme: plan.theme, forDate: plan.forDate, scheduledAt: plan.scheduledAt, caption, items }, ctx.insertOnly)
  return { ...base, result, events: picked.length, photos: items.filter((i) => i.image_ok).length, hook: hookSource, titles }
}

/**
 * Drafts for tomorrow (refreshed while still drafts), plus today's posts that
 * are still missing (first run, failed preparation). `date`: one given day only.
 */
export async function prepare(now: Date, opts: { dryRun?: boolean; date?: string } = {}): Promise<{ ok: true; dryRun: boolean; posts: PreparedSummary[] }> {
  const dryRun = Boolean(opts.dryRun)
  const [exclusions, signatureIds] = await Promise.all([loadExclusions(), getSignatureVenueIds()])
  const ctx = { now, dryRun, exclusions, signatureIds, candidates: new Map<string, Promise<Candidate[]>>(), photos: new Map<string, Promise<boolean>>() }
  const today = parisISODate(now)
  const days: { date: string; insertOnly: boolean }[] = opts.date
    ? [{ date: opts.date, insertOnly: false }]
    : [
        { date: today, insertOnly: true },
        { date: addDays(today, 1), insertOnly: false },
      ]
  const posts: PreparedSummary[] = []
  for (const day of days) {
    // Today: only what is still ahead (at least 30 minutes, time to look at it).
    const plans = planForDate(day.date).filter((p) => p.scheduledAt.getTime() > now.getTime() + 30 * 60_000)
    for (const plan of plans) {
      try {
        posts.push(await prepareOne(plan, { ...ctx, insertOnly: day.insertOnly }))
      } catch (err) {
        console.error('[instagram] prepare failed', plan.kind, plan.theme, err)
        posts.push({ kind: plan.kind, theme: plan.theme, forDate: plan.forDate, scheduledAt: plan.scheduledAt.toISOString(), result: 'skipped', events: 0, reason: 'Erreur de préparation' })
      }
    }
  }
  return { ok: true, dryRun, posts }
}

// ── Publish ─────────────────────────────────────────────────────────────────

export interface PublishSummary {
  id: string
  kind: string
  theme: string
  result: 'published' | 'failed' | 'skipped' | 'taken' | 'quota' | 'dry'
  mediaIds?: string[]
  permalink?: string | null
  error?: string
  dropped?: number
}

export type PublishRun =
  | { ok: false; error: string }
  | { ok: true; dryRun: boolean; token: string; quota?: { usage: number; total: number }; released?: number; stale?: number; posts: PublishSummary[] }

/** Refresh the long-lived token when it expires within 10 days (it must be ≥ 24 h old). */
export async function refreshTokenIfNeeded(creds: Credentials, now: Date, dryRun: boolean): Promise<{ status: string; token: string }> {
  const expires = creds.expiresAt?.getTime() ?? null
  if (expires != null && expires <= now.getTime()) return { status: 'expiré', token: creds.accessToken }
  if (expires != null && expires - now.getTime() > REFRESH_BEFORE_MS) return { status: 'valide', token: creds.accessToken }
  if (now.getTime() - creds.updatedAt.getTime() < 24 * 3600_000) return { status: 'trop récent pour être renouvelé', token: creds.accessToken }
  if (dryRun) return { status: 'à renouveler', token: creds.accessToken }
  try {
    const r = await new InstagramGraph({ token: creds.accessToken }).refreshToken()
    const expiresAt = new Date(now.getTime() + Math.max(r.expiresIn, 3600) * 1000)
    await saveRefreshedToken(r.token, expiresAt)
    return { status: 'renouvelé', token: r.token }
  } catch (err) {
    console.error('[instagram] token refresh failed', err instanceof Error ? err.message : err)
    return { status: 'échec du renouvellement', token: creds.accessToken }
  }
}

/** Slides to leave out: event no longer live, or excluded since the preview. */
async function droppedIndexes(post: PostRow, exclusions: Exclusion[]): Promise<number[]> {
  const ids = post.items.filter((i) => i.type === 'event' && i.event_id).map((i) => i.event_id!)
  const states = await loadEventStates(ids)
  const out: number[] = []
  post.items.forEach((it, i) => {
    if (it.type !== 'event' || !it.event_id || it.media_id) return
    const s = states.get(it.event_id)
    if (!s || s.status !== 'active') return void out.push(i)
    const asCandidate = { id: it.event_id, slug: s.slug, source: s.source, venueId: s.venueId, venueSlug: s.venueSlug } as Candidate
    if (isExcluded(asCandidate, exclusions)) out.push(i)
  })
  return out
}

function captionWithout(caption: string | null, items: PostItem[], dropped: number[]): string | null {
  if (!caption || !dropped.length) return caption
  let out = caption
  for (const i of dropped) out = out.replace(eventLine(items[i]) + '\n', '')
  return out
}

/**
 * Publish the due posts (or one post, `onlyId`, from the admin). Checks the
 * publishing quota first; stories need one slot per image.
 */
export async function publishDue(now: Date, opts: { dryRun?: boolean; onlyId?: string } = {}): Promise<PublishRun> {
  const dryRun = Boolean(opts.dryRun)
  const creds = await loadCredentials()
  if (!creds) return { ok: false, error: NOT_CONNECTED }

  let released = 0
  let stale = 0
  if (!dryRun) {
    released = await releaseStuck(new Date(now.getTime() - STUCK_AFTER_MS), MAX_ATTEMPTS)
    if (!opts.onlyId) stale = await skipStaleDrafts(new Date(now.getTime() - STALE_AFTER_MS))
  }
  const token = await refreshTokenIfNeeded(creds, now, dryRun)
  if (token.status === 'expiré') return { ok: false, error: 'Jeton Instagram expiré : reconnecte le compte dans /admin/instagram.' }

  let due: PostRow[]
  if (opts.onlyId) {
    const p = await getPost(opts.onlyId)
    due = p && (p.status === 'draft' || p.status === 'failed') ? [p] : []
  } else {
    due = await loadDuePosts(now, MAX_ATTEMPTS)
    if (dryRun) due = due.filter((p) => p.scheduledAt.getTime() > now.getTime() - STALE_AFTER_MS)
  }
  if (dryRun) {
    return {
      ok: true,
      dryRun,
      token: token.status,
      posts: due.map((p) => ({ id: p.id, kind: p.kind, theme: p.theme, result: 'dry' as const, error: p.error ?? undefined })),
    }
  }
  if (!due.length) return { ok: true, dryRun, token: token.status, released, stale, posts: [] }

  const graph = new InstagramGraph({ token: token.token })
  const quota = await graph.publishingLimit(creds.igUserId)
  let remaining = quota.total - quota.usage
  const exclusions = await loadExclusions()
  const started = Date.now()
  const posts: PublishSummary[] = []

  for (const post of due) {
    const base = { id: post.id, kind: post.kind, theme: post.theme }
    if (Date.now() - started > TIME_BUDGET_MS) break
    const dropped = await droppedIndexes(post, exclusions)
    const eventsLeft = post.items.filter((it, i) => it.type === 'event' && !dropped.includes(i)).length
    if (eventsLeft < (post.kind === 'carousel' ? 3 : 1)) {
      await setStatus(post.id, ['draft', 'failed'], 'skipped', { error: 'Sorties annulées ou exclues depuis l’aperçu' })
      posts.push({ ...base, result: 'skipped', dropped: dropped.length })
      continue
    }
    const items = post.items.map((it) => ({ ...it }))
    const publishable = { kind: post.kind, caption: captionWithout(post.caption, items, dropped), items, dropped }
    const needed = post.kind === 'carousel' ? 1 : publishableIndexes(publishable).length
    if (needed > remaining) {
      posts.push({ ...base, result: 'quota', error: `Quota Instagram : ${quota.usage}/${quota.total} sur 24 h` })
      break
    }
    if (!(await claimPost(post.id, post.status === 'failed' ? 'failed' : 'draft', MAX_ATTEMPTS))) {
      posts.push({ ...base, result: 'taken' })
      continue
    }
    try {
      const r = await publishToInstagram(
        graph,
        creds.igUserId,
        publishable,
        (i) => slideUrl(post.id, i, items[i]),
        async (i, mediaId) => {
          items[i] = { ...items[i], media_id: mediaId }
          await saveItems(post.id, items)
        }
      )
      await markPublished(post.id, r)
      remaining -= needed
      posts.push({ ...base, result: 'published', mediaIds: r.mediaIds, permalink: r.permalink, dropped: dropped.length })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[instagram] publish failed', post.kind, post.theme, msg)
      await markFailed(post.id, msg, err instanceof PublishUncertainError ? MAX_ATTEMPTS : undefined)
      posts.push({ ...base, result: 'failed', error: msg })
    }
  }
  return { ok: true, dryRun, token: token.status, quota, released, stale, posts }
}
