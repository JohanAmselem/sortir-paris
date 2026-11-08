/**
 * Instagram pipeline (server only).
 *   prepare(now)     the day before: drafts for tomorrow's schedule (preview in /admin/instagram)
 *   publishDue(now)  every 15 min (Vercel Cron): publishes the drafts whose time has come
 * Never twice the same post: (kind, theme, for_date) is unique, a post is
 * claimed with a conditional UPDATE … WHERE status = 'draft' before any call,
 * and publish-flow.ts never trusts an error answer (see there).
 * Never twice the same event: one post per event and per day, and not again
 * within NO_REPEAT_DAYS (select.ts, keysToAvoid).
 */
import 'server-only'
import { getSignatureVenueIds } from '@/lib/events/query'
import { parisISODate } from '@/lib/paris-time'
import { buildCaption, eventLine, hookInput } from './caption'
import {
  claimPost,
  getPost,
  listPosts,
  loadCandidates,
  loadCredentials,
  loadDuePosts,
  loadEventStates,
  loadExclusions,
  loadUncertainCarousels,
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
import { PublishLaterError, PublishUncertainError, captionHeader, findByHeader, publishToInstagram, publishableIndexes } from './publish-flow'
import { addDays, eventWindow, planForDate, windowDateLabel, type PlannedPost } from './schedule'
import { NO_REPEAT_DAYS, buildItems, candidateKeys, coverItem, isExcluded, keysToAvoid, selectEvents } from './select'
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
/** Stories: no new slide after this (the rest goes at the next pass). */
const SLIDE_BUDGET_MS = 240_000
/**
 * Real publishing limit per 24 h. content_publishing_limit announces 100, but
 * Instagram refused at about 50 (November 2026), as its documentation says.
 */
const PUBLISH_LIMIT = 50
/** Uncertain carousels are looked for on the account during 2 days. */
const RECONCILE_WITHIN_MS = 2 * 86400_000

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
  ctx: {
    now: Date
    dryRun: boolean
    insertOnly: boolean
    exclusions: Exclusion[]
    signatureIds: string[]
    candidates: Map<string, Promise<Candidate[]>>
    photos: Map<string, Promise<boolean>>
    /** Events already shown or planned: grows with each post written. */
    avoid: Set<string>
  }
): Promise<PreparedSummary> {
  const base = { kind: plan.kind, theme: plan.theme, forDate: plan.forDate, scheduledAt: plan.scheduledAt.toISOString() }
  const tw = eventWindow(plan.window, plan.scheduledAt)
  const key = `${plan.window}|${plan.scheduledAt.toISOString()}`
  let pool = ctx.candidates.get(key)
  if (!pool) {
    pool = loadCandidates(tw, ctx.now, ctx.signatureIds)
    ctx.candidates.set(key, pool)
  }
  const picked = selectEvents(
    await pool,
    { window: plan.window, theme: plan.theme, timeWindow: tw, exclusions: ctx.exclusions, signatureIds: new Set(ctx.signatureIds), avoid: ctx.avoid },
    plan.kind
  )
  const reserve = () => picked.forEach((c) => candidateKeys(c).forEach((k) => ctx.avoid.add(k)))
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
  if (ctx.dryRun) {
    reserve()
    return { ...base, result: 'dry', events: picked.length, titles }
  }

  await checkPhotos(items, ctx.photos)
  let caption: string | null = null
  let hookSource: 'ai' | 'template' | undefined
  if (plan.kind === 'carousel') {
    const hook = await writeHook(plan.theme, `${plan.theme}|${plan.forDate}`, hookInput(headline, dateLabel, items), { useAi: true })
    hookSource = hook.source
    caption = buildCaption({ hook: hook.hook, headline, dateLabel, items, hashtags: hashtagsFor(plan.theme) })
  }
  const result = await upsertDraft({ kind: plan.kind, theme: plan.theme, forDate: plan.forDate, scheduledAt: plan.scheduledAt, caption, items }, ctx.insertOnly)
  // 'kept': the existing row stays (its events are already in `avoid`).
  if (result === 'written') reserve()
  return { ...base, result, events: picked.length, photos: items.filter((i) => i.image_ok).length, hook: hookSource, titles }
}

/**
 * Drafts for tomorrow (refreshed while still drafts), plus today's posts that
 * are still missing (first run, failed preparation). `date`: one given day only.
 * An event appears in one post per day at most, and not again within
 * NO_REPEAT_DAYS (posts are prepared in plan order: carousels, then stories).
 */
export async function prepare(now: Date, opts: { dryRun?: boolean; date?: string } = {}): Promise<{ ok: true; dryRun: boolean; posts: PreparedSummary[] }> {
  const dryRun = Boolean(opts.dryRun)
  const today = parisISODate(now)
  const days: { date: string; insertOnly: boolean }[] = opts.date
    ? [{ date: opts.date, insertOnly: false }]
    : [
        { date: today, insertOnly: true },
        { date: addDays(today, 1), insertOnly: false },
      ]
  const [exclusions, signatureIds, recent] = await Promise.all([
    loadExclusions(),
    getSignatureVenueIds(),
    // The posts of the previous days and of the days being prepared.
    listPosts({ fromDate: addDays(days[0].date, -NO_REPEAT_DAYS), limit: 400, order: 'asc' }),
  ])
  const ctx = { now, dryRun, exclusions, signatureIds, candidates: new Map<string, Promise<Candidate[]>>(), photos: new Map<string, Promise<boolean>>() }
  const posts: PreparedSummary[] = []
  // Events of the posts written by this run, by day (today's new posts count for tomorrow).
  const written = new Map<string, Set<string>>()
  for (const day of days) {
    const fromDate = addDays(day.date, -NO_REPEAT_DAYS)
    const avoid = keysToAvoid(recent, day.date, fromDate, day.insertOnly)
    for (const [date, keys] of written) if (date >= fromDate && date < day.date) keys.forEach((k) => avoid.add(k))
    const before = new Set(avoid)
    // Today: only what is still ahead (at least 30 minutes, time to look at it).
    const plans = planForDate(day.date).filter((p) => p.scheduledAt.getTime() > now.getTime() + 30 * 60_000)
    for (const plan of plans) {
      try {
        posts.push(await prepareOne(plan, { ...ctx, insertOnly: day.insertOnly, avoid }))
      } catch (err) {
        console.error('[instagram] prepare failed', plan.kind, plan.theme, err)
        posts.push({ kind: plan.kind, theme: plan.theme, forDate: plan.forDate, scheduledAt: plan.scheduledAt.toISOString(), result: 'skipped', events: 0, reason: 'Erreur de préparation' })
      }
    }
    written.set(day.date, new Set([...avoid].filter((k) => !before.has(k))))
  }
  return { ok: true, dryRun, posts }
}

// ── Publish ─────────────────────────────────────────────────────────────────

export interface PublishSummary {
  id: string
  kind: string
  theme: string
  /** already: found on the account, marked published without sending it again. later: quota or time, next pass. */
  result: 'published' | 'already' | 'failed' | 'uncertain' | 'later' | 'skipped' | 'taken' | 'quota' | 'dry'
  mediaIds?: string[]
  permalink?: string | null
  error?: string
  dropped?: number
}

export type PublishRun =
  | { ok: false; error: string }
  | {
      ok: true
      dryRun: boolean
      token: string
      quota?: { usage: number; total: number }
      released?: number
      stale?: number
      /** Uncertain carousels found on the account and marked published. */
      reconciled?: number
      posts: PublishSummary[]
    }

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
 * Carousels left uncertain (error answer, interrupted run) that are in fact on
 * the account: marked published, with their id and link. Never sends anything.
 */
async function reconcileUncertain(graph: InstagramGraph, igUserId: string, now: Date): Promise<number> {
  const rows = await loadUncertainCarousels(new Date(now.getTime() - RECONCILE_WITHIN_MS), MAX_ATTEMPTS)
  if (!rows.length) return 0
  const media = await graph.recentMedia(igUserId)
  let n = 0
  for (const p of rows) {
    const header = captionHeader(p.caption)
    const live = header ? findByHeader(media, header, now) : null
    if (live && (await markPublished(p.id, { mediaIds: [live.id], permalink: live.permalink }, 'failed'))) n++
  }
  return n
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
    if (!opts.onlyId) stale = await skipStaleDrafts(new Date(now.getTime() - STALE_AFTER_MS), MAX_ATTEMPTS)
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
  const graph = new InstagramGraph({ token: token.token })
  let reconciled = 0
  try {
    reconciled = await reconcileUncertain(graph, creds.igUserId, now)
  } catch (err) {
    console.error('[instagram] reconcile failed', err instanceof Error ? err.message : err)
  }
  if (!due.length) return { ok: true, dryRun, token: token.status, released, stale, reconciled, posts: [] }

  const limit = await graph.publishingLimit(creds.igUserId)
  const quota = { usage: limit.usage, total: Math.min(limit.total, PUBLISH_LIMIT) }
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
      const r = await publishToInstagram(graph, creds.igUserId, publishable, (i) => slideUrl(post.id, i, items[i]), {
        now,
        deadline: started + SLIDE_BUDGET_MS,
        // Story slides: the container is saved before publishing, the result right after.
        onSlide: async (i, patch) => {
          items[i] = { ...items[i], ...patch }
          await saveItems(post.id, items)
        },
      })
      await markPublished(post.id, r)
      if (!r.already) remaining -= needed
      posts.push({ ...base, result: r.already ? 'already' : 'published', mediaIds: r.mediaIds, permalink: r.permalink, dropped: dropped.length })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[instagram] publish failed', post.kind, post.theme, msg)
      if (err instanceof PublishLaterError) {
        // Nothing uncertain went out: the attempt is given back, the next pass continues.
        await markFailed(post.id, msg, { refund: true })
        posts.push({ ...base, result: 'later', error: msg })
        break
      }
      const uncertain = err instanceof PublishUncertainError
      await markFailed(post.id, msg, uncertain ? { noRetryAfter: MAX_ATTEMPTS } : {})
      posts.push({ ...base, result: uncertain ? 'uncertain' : 'failed', error: msg })
    }
  }
  return { ok: true, dryRun, token: token.status, quota, released, stale, reconciled, posts }
}
