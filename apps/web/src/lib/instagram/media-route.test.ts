import { describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { slideVersion } from './media-url'
import type { PostItem } from './types'

const POST_ID = '11111111-2222-4333-8444-555555555555'
const items: PostItem[] = [
  { type: 'cover', title: 'Demain à Paris', subtitle: 'jeudi 15 octobre', when: 'Concerts' },
  { type: 'event', title: 'Quatuor Ébène', subtitle: 'Philharmonie de Paris · 19e', when: 'Jeu. 15 oct. · 20h', price: 'Dès 25 €', category: 'Concert' },
]

vi.mock('@/lib/instagram/data', () => ({
  getPost: vi.fn(async (id: string) => (id === POST_ID ? { id, kind: 'story', items } : null)),
}))

const { GET } = await import('@/app/api/instagram/media/[postId]/[index]/route')
const call = (postId: string, index: string, v?: string) =>
  GET(new Request(`https://www.panameclub.fr/api/instagram/media/${postId}/${index}${v ? `?v=${v}` : ''}`), { params: Promise.resolve({ postId, index }) })

describe('GET /api/instagram/media/[postId]/[index].jpg', { timeout: 30_000 }, () => {
  it('serves the slide as a JPEG of the right size, cached long for the exact version', async () => {
    const res = await call(POST_ID, '1.jpg', slideVersion(items[1]))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('cache-control')).toContain('s-maxage=2592000')
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata()
    expect(meta.format).toBe('jpeg')
    expect([meta.width, meta.height]).toEqual([1080, 1920])
  })

  it('caches briefly when the version does not match', async () => {
    const res = await call(POST_ID, '0.jpg', 'stale')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=300')
  })

  it('404 for unknown posts, slides and malformed ids', async () => {
    expect((await call(POST_ID, '9.jpg')).status).toBe(404)
    expect((await call('22222222-2222-4333-8444-555555555555', '0.jpg')).status).toBe(404)
    expect((await call('nope', '0.jpg')).status).toBe(404)
    expect((await call(POST_ID, 'x.png')).status).toBe(404)
  })
})
