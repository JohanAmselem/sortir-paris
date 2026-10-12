import { NextResponse } from 'next/server'
import { getPost } from '@/lib/instagram/data'
import { slideVersion } from '@/lib/instagram/media-url'
import { renderSlideInfo } from '@/lib/instagram/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/instagram/media/{postId}/{index}.jpg — one slide of a post, as the
 * JPEG Instagram downloads (and the admin previews). Rendered from the slide
 * stored in instagram_posts.items; the URL carries ?v=<hash of the slide>, so
 * the CDN can keep it for a long time.
 */
export async function GET(request: Request, { params }: { params: Promise<{ postId: string; index: string }> }) {
  const { postId, index } = await params
  const m = /^(\d{1,2})(\.jpe?g)?$/.exec(index)
  if (!UUID.test(postId) || !m) return new NextResponse('Not found', { status: 404 })
  const i = Number(m[1])
  let post
  try {
    post = await getPost(postId)
  } catch (err) {
    console.error('[instagram/media] read failed', err)
    return new NextResponse('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  const item = post?.items[i]
  if (!post || !item) return new NextResponse('Not found', { status: 404 })
  try {
    const { jpeg, degraded } = await renderSlideInfo(item, post.kind)
    // Long cache only for the exact version of the slide (?v= from the post), photo included.
    const exact = !degraded && new URL(request.url).searchParams.get('v') === slideVersion(item)
    return new NextResponse(new Uint8Array(jpeg), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(jpeg.length),
        'Cache-Control': exact ? 'public, max-age=86400, s-maxage=2592000, immutable' : 'public, max-age=60, s-maxage=300',
        'X-Robots-Tag': 'noindex',
      },
    })
  } catch (err) {
    console.error('[instagram/media] render failed', err)
    return new NextResponse('Render failed', { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
