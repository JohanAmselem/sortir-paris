/**
 * Instagram — database reads and writes (server only). Every read is LIMITed
 * and runs under a server-side statement timeout (small database).
 */
import 'server-only'
import { and, asc, desc, eq, gte, inArray, sql, type SQL } from 'drizzle-orm'
import {
  categories,
  db,
  events,
  instagramCredentials,
  instagramExclusions,
  instagramPosts,
  venues,
  withStatementTimeout,
} from '@sortir/db'
import { STATEMENT_TIMEOUT_MS, liveCondition, windowCondition } from '@/lib/events/query'
import type { TimeWindow } from '@/lib/paris-time'
import { MIN_QUALITY } from './select'
import type { Candidate, Exclusion, ExclusionKind, PostItem, PostKind, PostStatus } from './types'

const MAX_CANDIDATES = 800

export interface PostRow {
  id: string
  kind: PostKind
  theme: string
  forDate: string
  scheduledAt: Date
  status: PostStatus
  caption: string | null
  items: PostItem[]
  mediaId: string | null
  permalink: string | null
  error: string | null
  attempts: number
  updatedAt: Date
  publishedAt: Date | null
}

const postColumns = {
  id: instagramPosts.id,
  kind: instagramPosts.kind,
  theme: instagramPosts.theme,
  forDate: instagramPosts.forDate,
  scheduledAt: instagramPosts.scheduledAt,
  status: instagramPosts.status,
  caption: instagramPosts.caption,
  items: instagramPosts.items,
  mediaId: instagramPosts.mediaId,
  permalink: instagramPosts.permalink,
  error: instagramPosts.error,
  attempts: instagramPosts.attempts,
  updatedAt: instagramPosts.updatedAt,
  publishedAt: instagramPosts.publishedAt,
}

const toPost = (r: Record<string, unknown>): PostRow => ({ ...(r as unknown as PostRow), items: Array.isArray(r.items) ? (r.items as PostItem[]) : [] })

/** Live events of a window, best first, signature venues first (cinema excluded). */
export async function loadCandidates(tw: TimeWindow, now: Date, signatureIds: string[]): Promise<Candidate[]> {
  const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
    tx
      .select({
        id: events.id,
        slug: events.slug,
        title: events.title,
        shortDesc: events.shortDesc,
        imageUrl: events.imageUrl,
        startDate: events.startDate,
        endDate: events.endDate,
        timeKnown: events.timeKnown,
        priceMin: events.priceMin,
        priceMax: events.priceMax,
        priceStatus: events.priceStatus,
        isFree: events.isFree,
        qualityScore: events.qualityScore,
        saveCount: events.saveCount,
        source: events.source,
        status: events.status,
        categorySlug: categories.slug,
        venueId: events.venueId,
        venueName: venues.name,
        venueSlug: venues.slug,
        venueArr: venues.arrondissement,
        venueZip: venues.zipCode,
        venueCity: venues.city,
      })
      .from(events)
      .innerJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(
        and(
          liveCondition(now),
          windowCondition(tw, now),
          gte(events.qualityScore, MIN_QUALITY),
          sql`(${categories.slug} is null or ${categories.slug} <> 'cinema')`
        )
      )
      .orderBy(
        desc(signatureIds.length ? sql`${events.venueId} in ${signatureIds}` : sql`false`),
        desc(events.qualityScore),
        desc(sql`${events.imageUrl} is not null`),
        desc(events.saveCount),
        asc(events.startDate),
        asc(events.id)
      )
      .limit(MAX_CANDIDATES)
  )
  const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? new Date(String(d)).toISOString() : null)
  return rows.map((r) => ({
    ...r,
    id: String(r.id),
    startDate: iso(r.startDate)!,
    endDate: iso(r.endDate),
    venueId: r.venueId ? String(r.venueId) : null,
    priceMin: Number(r.priceMin ?? 0),
    priceMax: Number(r.priceMax ?? 0),
    qualityScore: Number(r.qualityScore ?? 0),
    saveCount: Number(r.saveCount ?? 0),
  }))
}

/** Current state of the events of a post (cancelled or expired since the preview?). */
export async function loadEventStates(ids: string[]): Promise<Map<string, { status: string; title: string; venueId: string | null; venueSlug: string | null; source: string; slug: string }>> {
  if (!ids.length) return new Map()
  const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
    tx
      .select({ id: events.id, status: events.status, title: events.title, venueId: events.venueId, venueSlug: venues.slug, source: events.source, slug: events.slug })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .where(inArray(events.id, ids))
      .limit(ids.length)
  )
  return new Map(rows.map((r) => [String(r.id), { ...r, venueId: r.venueId ? String(r.venueId) : null }]))
}

export async function loadExclusions(): Promise<(Exclusion & { id: string; reason: string | null; createdAt: Date })[]> {
  return withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
    tx
      .select({ id: instagramExclusions.id, kind: instagramExclusions.kind, value: instagramExclusions.value, reason: instagramExclusions.reason, createdAt: instagramExclusions.createdAt })
      .from(instagramExclusions)
      .orderBy(desc(instagramExclusions.createdAt))
      .limit(2000)
  )
}

export async function addExclusion(kind: ExclusionKind, value: string, reason: string | null): Promise<void> {
  await db
    .insert(instagramExclusions)
    .values({ kind, value: value.trim().slice(0, 200), reason: reason?.trim().slice(0, 300) || null })
    .onConflictDoUpdate({ target: [instagramExclusions.kind, instagramExclusions.value], set: { reason: reason?.trim().slice(0, 300) || null } })
}

export async function removeExclusion(id: string): Promise<void> {
  await db.delete(instagramExclusions).where(eq(instagramExclusions.id, id))
}

export interface Credentials {
  igUserId: string
  username: string | null
  accessToken: string
  expiresAt: Date | null
  updatedAt: Date
}

export async function loadCredentials(): Promise<Credentials | null> {
  const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
    tx
      .select({
        igUserId: instagramCredentials.igUserId,
        username: instagramCredentials.username,
        accessToken: instagramCredentials.accessToken,
        expiresAt: instagramCredentials.expiresAt,
        updatedAt: instagramCredentials.updatedAt,
      })
      .from(instagramCredentials)
      .where(eq(instagramCredentials.id, 1))
      .limit(1)
  )
  return rows[0] ?? null
}

export async function saveCredentials(c: { igUserId: string; username: string | null; accessToken: string; expiresAt: Date | null }): Promise<void> {
  const now = new Date()
  await db
    .insert(instagramCredentials)
    .values({ id: 1, ...c, updatedAt: now })
    .onConflictDoUpdate({ target: instagramCredentials.id, set: { ...c, updatedAt: now } })
}

export async function saveRefreshedToken(token: string, expiresAt: Date): Promise<void> {
  await db
    .update(instagramCredentials)
    .set({ accessToken: token, expiresAt, updatedAt: new Date() })
    .where(eq(instagramCredentials.id, 1))
}

export async function deleteCredentials(): Promise<void> {
  await db.delete(instagramCredentials).where(eq(instagramCredentials.id, 1))
}

/**
 * Create the draft, or refresh it while it is still a draft (a blocked,
 * published or failed post is never touched). `insertOnly`: leave an existing
 * row as it is (what the owner already previewed).
 */
export async function upsertDraft(
  p: { kind: PostKind; theme: string; forDate: string; scheduledAt: Date; caption: string | null; items: PostItem[] },
  insertOnly = false
): Promise<'written' | 'kept'> {
  const now = new Date()
  const q = db.insert(instagramPosts).values({ ...p, status: 'draft', updatedAt: now })
  const rows = insertOnly
    ? await q.onConflictDoNothing().returning({ id: instagramPosts.id })
    : await q
        .onConflictDoUpdate({
          target: [instagramPosts.kind, instagramPosts.theme, instagramPosts.forDate],
          set: { scheduledAt: p.scheduledAt, caption: p.caption, items: p.items, error: null, updatedAt: now },
          setWhere: sql`${instagramPosts.status} = 'draft'`,
        })
        .returning({ id: instagramPosts.id })
  return rows.length ? 'written' : 'kept'
}

/** A draft that no longer has enough events: skipped (never published). */
export async function skipDraft(kind: PostKind, theme: string, forDate: string, reason: string): Promise<void> {
  await db
    .update(instagramPosts)
    .set({ status: 'skipped', error: reason, updatedAt: new Date() })
    .where(and(eq(instagramPosts.kind, kind), eq(instagramPosts.theme, theme), eq(instagramPosts.forDate, forDate), eq(instagramPosts.status, 'draft')))
}

export async function getPost(id: string): Promise<PostRow | null> {
  const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) => tx.select(postColumns).from(instagramPosts).where(eq(instagramPosts.id, id)).limit(1))
  return rows[0] ? toPost(rows[0]) : null
}

/** Drafts (or retryable failures) whose time has come. */
export async function loadDuePosts(now: Date, maxAttempts: number, limit = 12): Promise<PostRow[]> {
  const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
    tx
      .select(postColumns)
      .from(instagramPosts)
      .where(
        and(
          sql`${instagramPosts.scheduledAt} <= ${now.toISOString()}::timestamptz`,
          sql`(${instagramPosts.status} = 'draft' or (${instagramPosts.status} = 'failed' and ${instagramPosts.attempts} < ${maxAttempts}))`
        )
      )
      .orderBy(asc(instagramPosts.scheduledAt), asc(instagramPosts.kind))
      .limit(limit)
  )
  return rows.map(toPost)
}

/** Posts for the admin and the link-in-bio page. */
export async function listPosts(opts: { fromDate?: string; statuses?: PostStatus[]; limit: number; order?: 'asc' | 'desc' }): Promise<PostRow[]> {
  const conds: SQL[] = []
  if (opts.fromDate) conds.push(gte(instagramPosts.forDate, opts.fromDate))
  if (opts.statuses?.length) conds.push(inArray(instagramPosts.status, opts.statuses))
  const rows = await withStatementTimeout(STATEMENT_TIMEOUT_MS, (tx) =>
    tx
      .select(postColumns)
      .from(instagramPosts)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(opts.order === 'asc' ? asc(instagramPosts.scheduledAt) : desc(instagramPosts.scheduledAt), asc(instagramPosts.theme))
      .limit(opts.limit)
  )
  return rows.map(toPost)
}

/**
 * Claim a post for publication: only one run can move it from `from` to
 * 'publishing' (conditional UPDATE). Returns false when someone else did.
 */
export async function claimPost(id: string, from: 'draft' | 'failed', maxAttempts: number): Promise<boolean> {
  const rows = await db
    .update(instagramPosts)
    .set({ status: 'publishing', attempts: sql`${instagramPosts.attempts} + 1`, updatedAt: new Date() })
    .where(and(eq(instagramPosts.id, id), eq(instagramPosts.status, from), sql`${instagramPosts.attempts} < ${maxAttempts}`))
    .returning({ id: instagramPosts.id })
  return rows.length === 1
}

export async function markPublished(id: string, r: { mediaIds: string[]; permalink: string | null; items?: PostItem[] }): Promise<void> {
  await db
    .update(instagramPosts)
    .set({
      status: 'published',
      mediaId: r.mediaIds.join(',').slice(0, 2000) || null,
      permalink: r.permalink,
      error: null,
      publishedAt: new Date(),
      updatedAt: new Date(),
      ...(r.items ? { items: r.items } : {}),
    })
    .where(and(eq(instagramPosts.id, id), eq(instagramPosts.status, 'publishing')))
}

/** `noRetryAfter`: attempts raised to this value, so the post is not retried automatically. */
export async function markFailed(id: string, error: string, noRetryAfter?: number): Promise<void> {
  await db
    .update(instagramPosts)
    .set({
      status: 'failed',
      error: error.slice(0, 1000),
      updatedAt: new Date(),
      ...(noRetryAfter ? { attempts: sql`greatest(${instagramPosts.attempts}, ${noRetryAfter})` } : {}),
    })
    .where(and(eq(instagramPosts.id, id), eq(instagramPosts.status, 'publishing')))
}

/** Story slides are saved as soon as each one is live (never published twice). */
export async function saveItems(id: string, items: PostItem[]): Promise<void> {
  await db.update(instagramPosts).set({ items, updatedAt: new Date() }).where(eq(instagramPosts.id, id))
}

export async function setStatus(id: string, from: PostStatus[], to: PostStatus, extra: { error?: string | null; scheduledAt?: Date; attempts?: number } = {}): Promise<boolean> {
  const rows = await db
    .update(instagramPosts)
    .set({ status: to, updatedAt: new Date(), ...extra })
    .where(and(eq(instagramPosts.id, id), inArray(instagramPosts.status, from)))
    .returning({ id: instagramPosts.id })
  return rows.length === 1
}

/** Drafts whose time passed long ago (cron down, quota): never published late. */
export async function skipStaleDrafts(before: Date): Promise<number> {
  const rows = await db
    .update(instagramPosts)
    .set({ status: 'skipped', error: 'Heure de publication dépassée', updatedAt: new Date() })
    .where(and(inArray(instagramPosts.status, ['draft', 'failed']), sql`${instagramPosts.scheduledAt} < ${before.toISOString()}::timestamptz`))
    .returning({ id: instagramPosts.id })
  return rows.length
}

/**
 * A run that died mid-publication leaves 'publishing'. The post may or may not
 * be live: failed with no automatic retry (never twice the same post); check
 * the account, then « Publier maintenant » from the admin if needed.
 */
export async function releaseStuck(before: Date, maxAttempts: number): Promise<number> {
  const rows = await db
    .update(instagramPosts)
    .set({
      status: 'failed',
      attempts: sql`greatest(${instagramPosts.attempts}, ${maxAttempts})`,
      error: 'Publication interrompue : vérifie le compte Instagram avant de republier.',
      updatedAt: new Date(),
    })
    .where(and(eq(instagramPosts.status, 'publishing'), sql`${instagramPosts.updatedAt} < ${before.toISOString()}::timestamptz`))
    .returning({ id: instagramPosts.id })
  return rows.length
}
