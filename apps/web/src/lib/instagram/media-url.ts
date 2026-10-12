import { createHash } from 'node:crypto'
import { absoluteUrl } from '@/lib/site'
import type { PostItem } from './types'

/**
 * Version of a slide: a hash of what it shows (media_id excluded). A refreshed
 * draft gets new URLs, so a cached image is never served for different content.
 */
export function slideVersion(item: PostItem): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { media_id, ...content } = item
  return createHash('sha1').update(JSON.stringify(content)).digest('hex').slice(0, 12)
}

/** Public JPEG URL of a slide (what Instagram downloads). */
export function slidePath(postId: string, index: number, item: PostItem): string {
  return `/api/instagram/media/${postId}/${index}.jpg?v=${slideVersion(item)}`
}

export function slideUrl(postId: string, index: number, item: PostItem): string {
  return absoluteUrl(slidePath(postId, index, item))
}
