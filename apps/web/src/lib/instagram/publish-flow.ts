/**
 * Publishing one post on Instagram (no database here: the caller persists).
 *   carousel: one container per slide (is_carousel_item), then the CAROUSEL
 *             container with the caption, wait FINISHED, media_publish.
 *   story:    one STORIES container per slide, each published on its own;
 *             slides already published (media_id set) are never sent again.
 */
import { InstagramApiError, type InstagramGraph } from './graph'
import type { PostItem } from './types'

export interface PublishablePost {
  kind: 'carousel' | 'story'
  caption: string | null
  items: PostItem[]
  /** Indexes left out at publication (event cancelled or excluded since the preview). */
  dropped?: number[]
}

/**
 * media_publish timed out or the server failed: the post may be live anyway.
 * Never retried automatically (a duplicate is worse than a missing post).
 */
export class PublishUncertainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublishUncertainError'
  }
}

async function publishContainer(graph: InstagramGraph, igUserId: string, containerId: string): Promise<string> {
  try {
    return await graph.publish(igUserId, containerId)
  } catch (err) {
    if (err instanceof InstagramApiError && err.status < 500) throw err
    throw new PublishUncertainError(`Publication incertaine : ${err instanceof Error ? err.message : String(err)}`)
  }
}

export interface PublishResult {
  mediaIds: string[]
  permalink: string | null
}

/** Slides that will be sent (by their index in items, which the media URL uses). */
export function publishableIndexes(post: PublishablePost): number[] {
  const dropped = new Set(post.dropped ?? [])
  return post.items
    .map((it, i) => ({ it, i }))
    .filter(({ it, i }) => !dropped.has(i) && (post.kind === 'carousel' || !it.media_id))
    .map(({ i }) => i)
}

export async function publishToInstagram(
  graph: InstagramGraph,
  igUserId: string,
  post: PublishablePost,
  mediaUrl: (index: number) => string,
  onStoryPublished?: (index: number, mediaId: string) => Promise<void>
): Promise<PublishResult> {
  if (post.kind === 'carousel') {
    const indexes = publishableIndexes(post)
    if (indexes.length < 2 || indexes.length > 10) throw new Error(`Un carrousel a de 2 à 10 images (ici ${indexes.length}).`)
    const children: string[] = []
    for (const i of indexes) children.push(await graph.createImageContainer(igUserId, mediaUrl(i), 'carousel_item'))
    for (const id of children) await graph.waitFinished(id)
    const parent = await graph.createCarouselContainer(igUserId, children, post.caption ?? '')
    await graph.waitFinished(parent)
    const mediaId = await publishContainer(graph, igUserId, parent)
    return { mediaIds: [mediaId], permalink: await graph.permalink(mediaId) }
  }

  const mediaIds = post.items.filter((it) => it.media_id).map((it) => it.media_id!)
  for (const i of publishableIndexes(post)) {
    const container = await graph.createImageContainer(igUserId, mediaUrl(i), 'story')
    await graph.waitFinished(container)
    const mediaId = await publishContainer(graph, igUserId, container)
    mediaIds.push(mediaId)
    if (onStoryPublished) await onStoryPublished(i, mediaId)
  }
  return { mediaIds, permalink: mediaIds[0] ? await graph.permalink(mediaIds[0]) : null }
}
