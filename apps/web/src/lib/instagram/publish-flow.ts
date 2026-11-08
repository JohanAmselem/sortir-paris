/**
 * Publishing one post on Instagram (no database here: the caller persists).
 *   carousel: one container per slide (is_carousel_item), then the CAROUSEL
 *             container with the caption, wait FINISHED, media_publish.
 *   story:    one STORIES container per slide, each published on its own;
 *             slides already live (media_id or live) are never sent again, and
 *             a slide whose container was saved is checked before anything else.
 *
 * Never twice the same post. Instagram can answer media_publish with an error
 * and publish anyway (« Nous restreignons certaines activités… »: 24 carousels
 * went out three times in October–November 2026). So:
 *   - after an error, the container's status decides (PUBLISHED = live);
 *   - only « not ready » and « quota reached » are known to publish nothing
 *     (retried); any other error is uncertain and never retried automatically;
 *   - before a carousel goes out, the account's latest posts are checked for
 *     the same header line (« Demain à Paris · samedi 7 novembre »).
 */
import { isNotReady, isQuotaReached, sleep, type InstagramGraph, type RecentMedia } from './graph'
import { CAROUSEL_THEMES } from './themes'
import type { PostItem } from './types'

export interface PublishablePost {
  kind: 'carousel' | 'story'
  caption: string | null
  items: PostItem[]
  /** Indexes left out at publication (event cancelled or excluded since the preview). */
  dropped?: number[]
}

/**
 * Instagram answered with an error but the post may be live anyway.
 * Never retried automatically (a duplicate is worse than a missing post).
 */
export class PublishUncertainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublishUncertainError'
  }
}

/** Nothing uncertain went out (quota reached, time budget spent): continue at a later pass, no attempt used. */
export class PublishLaterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublishLaterError'
  }
}

/** « Not ready »: publish the same container again, up to 3 more times, a few seconds apart. */
const NOT_READY_RETRIES = 3
/** A carousel already on the account is found among its last posts of the past week. */
const ALREADY_LIVE_WITHIN_MS = 7 * 86400_000

/** media_publish with Instagram's error answers sorted out. `mediaId: null`: live, id unknown. */
async function publishContainer(graph: InstagramGraph, igUserId: string, containerId: string): Promise<{ mediaId: string | null }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return { mediaId: await graph.publish(igUserId, containerId) }
    } catch (err) {
      const notReady = isNotReady(err)
      // The answer is not the truth: the container's status is.
      if (await graph.isPublished(containerId, notReady ? 1 : 3)) return { mediaId: null }
      const msg = err instanceof Error ? err.message : String(err)
      if (notReady) {
        if (attempt < NOT_READY_RETRIES) {
          await sleep(graph.pollMs * 2)
          continue
        }
        throw err // nothing went live: a later pass tries again
      }
      if (isQuotaReached(err)) throw new PublishLaterError(`Quota Instagram atteint : ${msg}`)
      throw new PublishUncertainError(`Publication incertaine : ${msg}`)
    }
  }
}

/** « Demain à Paris · samedi 7 novembre »: the line that identifies a carousel's caption. */
export function captionHeader(caption: string | null): string | null {
  if (!caption) return null
  const heads = Object.values(CAROUSEL_THEMES).map((t) => `${t.headline} · `)
  return caption
    .split('\n')
    .map((l) => l.trim())
    .find((l) => heads.some((h) => l.startsWith(h))) ?? null
}

/** Instagram writes « 2026-11-07T17:15:40+0000 ». */
const parseTimestamp = (t: string | null) => (t ? new Date(t.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).getTime() : NaN)

/** The account's post whose caption has this header line (published within the past week). */
export function findByHeader(media: RecentMedia[], header: string, now: Date): RecentMedia | null {
  return (
    media.find((m) => {
      if (!m.caption) return false
      const at = parseTimestamp(m.timestamp)
      if (Number.isFinite(at) && now.getTime() - at > ALREADY_LIVE_WITHIN_MS) return false
      return m.caption.split('\n').some((l) => l.trim() === header)
    }) ?? null
  )
}

export interface PublishResult {
  mediaIds: string[]
  permalink: string | null
  /** The carousel was already on the account (a previous run): nothing was sent. */
  already?: boolean
}

export interface PublishOptions {
  now?: Date
  /** Stories: no new slide after this time (ms epoch); the rest goes at the next pass. */
  deadline?: number
  /** Stories: called as soon as a slide changes (container saved before publishing, then live). */
  onSlide?: (index: number, patch: Partial<PostItem>) => Promise<void>
}

/** Slides that will be sent (by their index in items, which the media URL uses). */
export function publishableIndexes(post: PublishablePost): number[] {
  const dropped = new Set(post.dropped ?? [])
  return post.items
    .map((it, i) => ({ it, i }))
    .filter(({ it, i }) => !dropped.has(i) && (post.kind === 'carousel' || (!it.media_id && !it.live)))
    .map(({ i }) => i)
}

/** A carousel already live: its id and link, read from the account's latest posts. */
export async function findLiveCarousel(graph: InstagramGraph, igUserId: string, caption: string | null, now: Date): Promise<RecentMedia | null> {
  const header = captionHeader(caption)
  if (!header) return null
  return findByHeader(await graph.recentMedia(igUserId), header, now)
}

async function publishCarousel(graph: InstagramGraph, igUserId: string, post: PublishablePost, mediaUrl: (index: number) => string, now: Date): Promise<PublishResult> {
  const indexes = publishableIndexes(post)
  if (indexes.length < 2 || indexes.length > 10) throw new Error(`Un carrousel a de 2 à 10 images (ici ${indexes.length}).`)
  // Already out (a previous run got an error answer, or died after publishing)?
  const live = await findLiveCarousel(graph, igUserId, post.caption, now)
  if (live) return { mediaIds: [live.id], permalink: live.permalink, already: true }

  const children: string[] = []
  for (const i of indexes) children.push(await graph.createImageContainer(igUserId, mediaUrl(i), 'carousel_item'))
  for (const id of children) await graph.waitFinished(id)
  const parent = await graph.createCarouselContainer(igUserId, children, post.caption ?? '')
  await graph.waitFinished(parent)
  const { mediaId } = await publishContainer(graph, igUserId, parent)
  if (mediaId) return { mediaIds: [mediaId], permalink: await graph.permalink(mediaId) }
  // Live, id unknown: look it up (never fatal, the post is out).
  const found = await findLiveCarousel(graph, igUserId, post.caption, now).catch(() => null)
  return { mediaIds: found ? [found.id] : [], permalink: found?.permalink ?? null }
}

async function publishStory(graph: InstagramGraph, igUserId: string, post: PublishablePost, mediaUrl: (index: number) => string, opts: PublishOptions): Promise<PublishResult> {
  const save = opts.onSlide ?? (async () => {})
  const mediaIds = post.items.filter((it) => it.media_id).map((it) => it.media_id!)
  for (const i of publishableIndexes(post)) {
    if (opts.deadline != null && Date.now() > opts.deadline) throw new PublishLaterError('Temps écoulé : la suite de la story partira à la prochaine passe.')
    let container = post.items[i].container_id ?? null
    if (container) {
      // A previous run created this slide's container: is it already live?
      let status: string
      try {
        status = await graph.containerStatus(container)
      } catch (err) {
        throw new PublishUncertainError(`Publication incertaine : conteneur ${container} illisible (${err instanceof Error ? err.message : String(err)})`)
      }
      if (status === 'PUBLISHED') {
        await save(i, { live: true })
        continue
      }
      if (status === 'ERROR' || status === 'EXPIRED') container = null
      else if (status !== 'FINISHED' && status !== 'IN_PROGRESS') throw new PublishUncertainError(`Publication incertaine : conteneur ${container} au statut ${status}`)
    }
    if (!container) {
      container = await graph.createImageContainer(igUserId, mediaUrl(i), 'story')
      await save(i, { container_id: container })
    }
    await graph.waitFinished(container)
    const { mediaId } = await publishContainer(graph, igUserId, container)
    if (mediaId) mediaIds.push(mediaId)
    await save(i, mediaId ? { media_id: mediaId } : { live: true })
  }
  return { mediaIds, permalink: mediaIds[0] ? await graph.permalink(mediaIds[0]) : null }
}

export async function publishToInstagram(
  graph: InstagramGraph,
  igUserId: string,
  post: PublishablePost,
  mediaUrl: (index: number) => string,
  opts: PublishOptions = {}
): Promise<PublishResult> {
  if (post.kind === 'carousel') return publishCarousel(graph, igUserId, post, mediaUrl, opts.now ?? new Date())
  return publishStory(graph, igUserId, post, mediaUrl, opts)
}
