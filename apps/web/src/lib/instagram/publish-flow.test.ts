import { describe, expect, it } from 'vitest'
import { InstagramApiError, InstagramGraph, redact } from './graph'
import { PublishUncertainError, publishToInstagram, publishableIndexes } from './publish-flow'
import { isAdminEmail, maskToken } from './admin'
import type { PostItem } from './types'

type Call = { method: string; url: URL; body: URLSearchParams | null }

/** Fake Graph API: records the calls, answers like Instagram. */
function fakeGraph(opts: { statuses?: string[]; failPublish?: 'api' | 'network' } = {}) {
  const calls: Call[] = []
  let seq = 0
  const statuses = [...(opts.statuses ?? [])]
  const fetch = async (input: string, init?: RequestInit) => {
    const url = new URL(input)
    const body = init?.body instanceof URLSearchParams ? init.body : null
    calls.push({ method: init?.method ?? 'GET', url, body })
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })
    if (url.pathname.endsWith('/media')) return json({ id: `c${++seq}` })
    if (url.pathname.endsWith('/media_publish')) {
      if (opts.failPublish === 'network') throw new Error('socket hang up')
      if (opts.failPublish === 'api') return json({ error: { message: 'Media ID is not available', code: 9007 } }, 400)
      return json({ id: `m${++seq}` })
    }
    if (url.searchParams.get('fields') === 'status_code') return json({ status_code: statuses.shift() ?? 'FINISHED' })
    if (url.searchParams.get('fields') === 'permalink') return json({ permalink: `https://www.instagram.com/p/${url.pathname.split('/').pop()}/` })
    if (url.pathname.endsWith('/content_publishing_limit')) return json({ data: [{ quota_usage: 3, config: { quota_total: 50, quota_duration: 86400 } }] })
    if (url.pathname.endsWith('/refresh_access_token')) return json({ access_token: 'NEWTOKEN123456', token_type: 'bearer', expires_in: 5183944 })
    return json({ error: { message: 'unknown' } }, 404)
  }
  const graph = new InstagramGraph({ token: 'SECRETTOKEN123', base: 'https://graph.instagram.com/v23.0', fetch, pollMs: 0, pollTimeoutMs: 1000 })
  return { graph, calls }
}

const slide = (i: number, over: Partial<PostItem> = {}): PostItem => ({ type: i === 0 ? 'cover' : 'event', title: `Slide ${i}`, ...over })
const url = (i: number) => `https://www.panameclub.fr/api/instagram/media/p/${i}.jpg`

describe('publishToInstagram — carousel', () => {
  it('creates the children, then the CAROUSEL container with the caption, then publishes', async () => {
    const { graph, calls } = fakeGraph({ statuses: ['IN_PROGRESS', 'FINISHED'] })
    const items = [0, 1, 2, 3].map((i) => slide(i))
    const r = await publishToInstagram(graph, '17841400000', { kind: 'carousel', caption: 'Légende', items }, url)

    const posts = calls.filter((c) => c.method === 'POST')
    expect(posts).toHaveLength(6)
    for (let i = 0; i < 4; i++) {
      expect(posts[i].url.pathname).toBe('/v23.0/17841400000/media')
      expect(posts[i].body!.get('image_url')).toBe(url(i))
      expect(posts[i].body!.get('is_carousel_item')).toBe('true')
      expect(posts[i].body!.get('access_token')).toBe('SECRETTOKEN123')
    }
    expect(posts[4].body!.get('media_type')).toBe('CAROUSEL')
    expect(posts[4].body!.get('children')).toBe('c1,c2,c3,c4')
    expect(posts[4].body!.get('caption')).toBe('Légende')
    expect(posts[5].url.pathname).toBe('/v23.0/17841400000/media_publish')
    expect(posts[5].body!.get('creation_id')).toBe('c5')
    expect(r.mediaIds).toEqual(['m6'])
    expect(r.permalink).toBe('https://www.instagram.com/p/m6/')
  })

  it('leaves out dropped slides (event cancelled since the preview)', async () => {
    const { graph, calls } = fakeGraph()
    const items = [0, 1, 2, 3].map((i) => slide(i))
    await publishToInstagram(graph, '1', { kind: 'carousel', caption: '', items, dropped: [2] }, url)
    const imageUrls = calls.filter((c) => c.body?.get('is_carousel_item')).map((c) => c.body!.get('image_url'))
    expect(imageUrls).toEqual([url(0), url(1), url(3)])
  })

  it('refuses more than 10 images', async () => {
    const { graph } = fakeGraph()
    const items = Array.from({ length: 11 }, (_, i) => slide(i))
    await expect(publishToInstagram(graph, '1', { kind: 'carousel', caption: '', items }, url)).rejects.toThrow(/2 à 10/)
  })

  it('stops on a container in ERROR', async () => {
    const { graph, calls } = fakeGraph({ statuses: ['ERROR'] })
    await expect(publishToInstagram(graph, '1', { kind: 'carousel', caption: '', items: [slide(0), slide(1)] }, url)).rejects.toBeInstanceOf(InstagramApiError)
    expect(calls.some((c) => c.url.pathname.endsWith('/media_publish'))).toBe(false)
  })

  it('marks a publish that may have gone through as uncertain (no automatic retry)', async () => {
    const { graph } = fakeGraph({ failPublish: 'network' })
    await expect(publishToInstagram(graph, '1', { kind: 'carousel', caption: '', items: [slide(0), slide(1)] }, url)).rejects.toBeInstanceOf(PublishUncertainError)
    const api = fakeGraph({ failPublish: 'api' })
    await expect(publishToInstagram(api.graph, '1', { kind: 'carousel', caption: '', items: [slide(0), slide(1)] }, url)).rejects.toBeInstanceOf(InstagramApiError)
  })
})

describe('publishToInstagram — stories', () => {
  it('publishes each slide as a STORIES container, one by one, and reports each media id', async () => {
    const { graph, calls } = fakeGraph()
    const saved: [number, string][] = []
    const items = [0, 1, 2].map((i) => slide(i))
    const r = await publishToInstagram(graph, '1', { kind: 'story', caption: null, items }, url, async (i, id) => {
      saved.push([i, id])
    })
    const containers = calls.filter((c) => c.url.pathname.endsWith('/media'))
    expect(containers.map((c) => c.body!.get('media_type'))).toEqual(['STORIES', 'STORIES', 'STORIES'])
    expect(containers.every((c) => !c.body!.has('caption') && !c.body!.has('is_carousel_item'))).toBe(true)
    expect(calls.filter((c) => c.url.pathname.endsWith('/media_publish'))).toHaveLength(3)
    expect(saved.map(([i]) => i)).toEqual([0, 1, 2])
    expect(r.mediaIds).toHaveLength(3)
  })

  it('never republishes a story slide that is already live', async () => {
    const { graph, calls } = fakeGraph()
    const items = [slide(0, { media_id: 'old0' }), slide(1, { media_id: 'old1' }), slide(2)]
    expect(publishableIndexes({ kind: 'story', caption: null, items })).toEqual([2])
    const r = await publishToInstagram(graph, '1', { kind: 'story', caption: null, items }, url)
    expect(calls.filter((c) => c.url.pathname.endsWith('/media'))).toHaveLength(1)
    expect(r.mediaIds.slice(0, 2)).toEqual(['old0', 'old1'])
  })
})

describe('InstagramGraph', () => {
  it('reads the publishing quota', async () => {
    const { graph, calls } = fakeGraph()
    expect(await graph.publishingLimit('42')).toEqual({ usage: 3, total: 50 })
    expect(calls[0].url.pathname).toBe('/v23.0/42/content_publishing_limit')
    expect(calls[0].url.searchParams.get('fields')).toBe('quota_usage,config')
  })

  it('refreshes the long-lived token on the unversioned endpoint', async () => {
    const { graph, calls } = fakeGraph()
    expect(await graph.refreshToken()).toEqual({ token: 'NEWTOKEN123456', expiresIn: 5183944 })
    expect(calls[0].url.origin + calls[0].url.pathname).toBe('https://graph.instagram.com/refresh_access_token')
    expect(calls[0].url.searchParams.get('grant_type')).toBe('ig_refresh_token')
  })

  it('never stores the token in an error message', () => {
    expect(redact('bad token SECRETTOKEN123 here', 'SECRETTOKEN123')).toBe('bad token [jeton] here')
  })
})

describe('admin access', () => {
  it('allows the listed e-mails only, case-insensitive, with the default list', () => {
    expect(isAdminEmail('Contact@Studio-Juno.fr')).toBe(true)
    expect(isAdminEmail('johan.amselem@gmail.com', '')).toBe(true)
    expect(isAdminEmail('someone@example.org')).toBe(false)
    expect(isAdminEmail('a@b.fr', ' a@b.fr , c@d.fr')).toBe(true)
    expect(isAdminEmail('contact@studio-juno.fr', 'a@b.fr')).toBe(false)
    expect(isAdminEmail(null)).toBe(false)
  })

  it('shows only the last 4 characters of the token', () => {
    expect(maskToken('IGQWRabcdef1234')).toBe('••••1234')
  })
})
