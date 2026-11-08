import { describe, expect, it } from 'vitest'
import { InstagramApiError, InstagramGraph, isNotReady, isQuotaReached, redact, type RecentMedia } from './graph'
import { PublishLaterError, PublishUncertainError, captionHeader, findByHeader, publishToInstagram, publishableIndexes } from './publish-flow'
import { isAdminEmail, maskToken } from './admin'
import type { PostItem } from './types'

type Call = { method: string; url: URL; body: URLSearchParams | null }
/** What Instagram answers to one media_publish call. */
type PublishOutcome = 'ok' | 'notReady' | 'restricted' | 'quota' | 'network'

/**
 * Fake Graph API: records the calls, answers like Instagram. `restrictedPublishes`:
 * the « Nous restreignons… » answer still puts the post online (seen in production).
 */
function fakeGraph(
  opts: {
    statuses?: string[]
    statusOf?: Record<string, string>
    publish?: PublishOutcome[]
    restrictedPublishes?: boolean
    recent?: RecentMedia[]
  } = {}
) {
  const calls: Call[] = []
  let seq = 0
  const statuses = [...(opts.statuses ?? [])]
  const outcomes = [...(opts.publish ?? [])]
  const published = new Set<string>()
  const captions = new Map<string, string>()
  const recent: RecentMedia[] = [...(opts.recent ?? [])]
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })
  const goLive = (container: string) => {
    published.add(container)
    const id = `m${++seq}`
    recent.unshift({ id, caption: captions.get(container) ?? null, timestamp: new Date().toISOString().replace(/\.\d+Z$/, '+0000'), permalink: `https://www.instagram.com/p/${id}/` })
    return id
  }
  const fetch = async (input: string, init?: RequestInit) => {
    const url = new URL(input)
    const method = init?.method ?? 'GET'
    const body = init?.body instanceof URLSearchParams ? init.body : null
    calls.push({ method, url, body })
    if (url.pathname.endsWith('/media') && method === 'GET') return json({ data: recent })
    if (url.pathname.endsWith('/media')) {
      const id = `c${++seq}`
      if (body?.get('caption') != null) captions.set(id, body.get('caption')!)
      return json({ id })
    }
    if (url.pathname.endsWith('/media_publish')) {
      const container = body!.get('creation_id')!
      const outcome = outcomes.shift() ?? 'ok'
      if (outcome === 'network') throw new Error('socket hang up')
      if (outcome === 'notReady')
        return json({ error: { message: 'Media ID is not available', code: 9007, error_subcode: 2207027, error_user_msg: 'Le contenu n’est pas prêt à être publié, patientez un peu' } }, 400)
      if (outcome === 'quota')
        return json({ error: { message: 'Application request limit reached', code: 9, error_subcode: 2207042, error_user_msg: 'Vous avez atteint le nombre maximal de publications pouvant être publiées par l’API Content Publishing.' } }, 400)
      if (outcome === 'restricted') {
        if (opts.restrictedPublishes) goLive(container)
        return json({ error: { message: 'Restricted', code: 4, error_subcode: 2207051, error_user_msg: 'Nous restreignons certaines activités afin de protéger notre communauté.', fbtrace_id: 'AbC' } }, 400)
      }
      return json({ id: goLive(container) })
    }
    if (url.searchParams.get('fields') === 'status_code') {
      const id = url.pathname.split('/').pop()!
      if (published.has(id)) return json({ status_code: 'PUBLISHED' })
      if (opts.statusOf?.[id]) return json({ status_code: opts.statusOf[id] })
      return json({ status_code: statuses.shift() ?? 'FINISHED' })
    }
    if (url.searchParams.get('fields') === 'permalink') return json({ permalink: `https://www.instagram.com/p/${url.pathname.split('/').pop()}/` })
    if (url.pathname.endsWith('/content_publishing_limit')) return json({ data: [{ quota_usage: 3, config: { quota_total: 50, quota_duration: 86400 } }] })
    if (url.pathname.endsWith('/refresh_access_token')) return json({ access_token: 'NEWTOKEN123456', token_type: 'bearer', expires_in: 5183944 })
    return json({ error: { message: 'unknown' } }, 404)
  }
  const graph = new InstagramGraph({ token: 'SECRETTOKEN123', base: 'https://graph.instagram.com/v23.0', fetch, pollMs: 0, pollTimeoutMs: 1000 })
  const publishCalls = () => calls.filter((c) => c.url.pathname.endsWith('/media_publish'))
  const created = () => calls.filter((c) => c.method === 'POST' && c.url.pathname.endsWith('/media'))
  return { graph, calls, publishCalls, created, recent }
}

const slide = (i: number, over: Partial<PostItem> = {}): PostItem => ({ type: i === 0 ? 'cover' : 'event', title: `Slide ${i}`, ...over })
const url = (i: number) => `https://www.panameclub.fr/api/instagram/media/p/${i}.jpg`
const CAPTION = 'Ta sortie de demain est déjà trouvée.\n\nDemain à Paris · samedi 7 novembre\n• Concert — Salle · 11e — Sam. 7 nov. · 20h — 12 €\n\n#paris'
const carousel = (n = 4) => ({ kind: 'carousel' as const, caption: CAPTION, items: Array.from({ length: n }, (_, i) => slide(i)) })

describe('publishToInstagram — carousel', () => {
  it('checks the account, creates the children, then the CAROUSEL container with the caption, then publishes', async () => {
    const { graph, calls } = fakeGraph({ statuses: ['IN_PROGRESS', 'FINISHED'] })
    const r = await publishToInstagram(graph, '17841400000', { kind: 'carousel', caption: CAPTION, items: [0, 1, 2, 3].map((i) => slide(i)) }, url)

    expect(calls[0].method).toBe('GET')
    expect(calls[0].url.pathname).toBe('/v23.0/17841400000/media')
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
    expect(posts[4].body!.get('caption')).toBe(CAPTION)
    expect(posts[5].url.pathname).toBe('/v23.0/17841400000/media_publish')
    expect(posts[5].body!.get('creation_id')).toBe('c5')
    expect(r.mediaIds).toEqual(['m6'])
    expect(r.permalink).toBe('https://www.instagram.com/p/m6/')
    expect(r.already).toBeUndefined()
  })

  it('leaves out dropped slides (event cancelled since the preview)', async () => {
    const { graph, calls } = fakeGraph()
    await publishToInstagram(graph, '1', { ...carousel(), dropped: [2] }, url)
    const imageUrls = calls.filter((c) => c.body?.get('is_carousel_item')).map((c) => c.body!.get('image_url'))
    expect(imageUrls).toEqual([url(0), url(1), url(3)])
  })

  it('refuses more than 10 images', async () => {
    const { graph } = fakeGraph()
    await expect(publishToInstagram(graph, '1', carousel(11), url)).rejects.toThrow(/2 à 10/)
  })

  it('stops on a container in ERROR', async () => {
    const { graph, publishCalls } = fakeGraph({ statuses: ['ERROR'] })
    await expect(publishToInstagram(graph, '1', carousel(2), url)).rejects.toBeInstanceOf(InstagramApiError)
    expect(publishCalls()).toHaveLength(0)
  })

  it('sends nothing when the same carousel is already on the account (previous run)', async () => {
    const { graph, calls } = fakeGraph({
      recent: [{ id: '1790', caption: 'Autre accroche\n\nDemain à Paris · samedi 7 novembre\n• …', timestamp: new Date(Date.now() - 3600_000).toISOString(), permalink: 'https://www.instagram.com/p/DfaGLA2iOup/' }],
    })
    const r = await publishToInstagram(graph, '1', carousel(), url)
    expect(r).toEqual({ mediaIds: ['1790'], permalink: 'https://www.instagram.com/p/DfaGLA2iOup/', already: true })
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  it('an error answer while the post went live is a success: published once, never retried', async () => {
    // October–November 2026: « Nous restreignons… » and the carousel was online anyway.
    const { graph, publishCalls, recent } = fakeGraph({ publish: ['restricted'], restrictedPublishes: true })
    const r = await publishToInstagram(graph, '1', carousel(), url)
    expect(publishCalls()).toHaveLength(1)
    expect(recent).toHaveLength(1)
    expect(r.mediaIds).toEqual([recent[0].id])
    expect(r.permalink).toBe(recent[0].permalink)
  })

  it('an error answer with nothing live is uncertain: no second media_publish', async () => {
    const { graph, publishCalls } = fakeGraph({ publish: ['restricted'] })
    const err = await publishToInstagram(graph, '1', carousel(), url).catch((e) => e)
    expect(err).toBeInstanceOf(PublishUncertainError)
    expect(err.message).toMatch(/code 4\/2207051/)
    expect(publishCalls()).toHaveLength(1)
    const network = fakeGraph({ publish: ['network'] })
    await expect(publishToInstagram(network.graph, '1', carousel(), url)).rejects.toBeInstanceOf(PublishUncertainError)
  })

  it('« not ready »: publishes the same container again a few seconds later', async () => {
    const { graph, publishCalls, created } = fakeGraph({ publish: ['notReady', 'notReady', 'ok'] })
    const r = await publishToInstagram(graph, '1', carousel(), url)
    expect(publishCalls().map((c) => c.body!.get('creation_id'))).toEqual(['c5', 'c5', 'c5'])
    expect(created()).toHaveLength(5)
    expect(r.mediaIds).toHaveLength(1)
  })

  it('« not ready » every time: a plain error (nothing live, a later pass retries)', async () => {
    const { graph, publishCalls } = fakeGraph({ publish: ['notReady', 'notReady', 'notReady', 'notReady'] })
    const err = await publishToInstagram(graph, '1', carousel(), url).catch((e) => e)
    expect(err).toBeInstanceOf(InstagramApiError)
    expect(err).not.toBeInstanceOf(PublishUncertainError)
    expect(publishCalls()).toHaveLength(4)
  })

  it('quota reached: try again later, nothing uncertain', async () => {
    const { graph } = fakeGraph({ publish: ['quota'] })
    await expect(publishToInstagram(graph, '1', carousel(), url)).rejects.toBeInstanceOf(PublishLaterError)
  })
})

describe('publishToInstagram — stories', () => {
  const story = (items: PostItem[]) => ({ kind: 'story' as const, caption: null, items })

  it('publishes each slide as a STORIES container, saving the container before publishing it', async () => {
    const { graph, calls, publishCalls } = fakeGraph()
    const saved: [number, Partial<PostItem>, number][] = []
    const r = await publishToInstagram(graph, '1', story([0, 1, 2].map((i) => slide(i))), url, {
      onSlide: async (i, patch) => {
        saved.push([i, patch, publishCalls().length])
      },
    })
    const containers = calls.filter((c) => c.method === 'POST' && c.url.pathname.endsWith('/media'))
    expect(containers.map((c) => c.body!.get('media_type'))).toEqual(['STORIES', 'STORIES', 'STORIES'])
    expect(containers.every((c) => !c.body!.has('caption') && !c.body!.has('is_carousel_item'))).toBe(true)
    expect(publishCalls()).toHaveLength(3)
    // Slide i: container saved before its media_publish, then its media id.
    expect(saved.map(([i, patch, before]) => [i, Object.keys(patch)[0], before])).toEqual([
      [0, 'container_id', 0],
      [0, 'media_id', 1],
      [1, 'container_id', 1],
      [1, 'media_id', 2],
      [2, 'container_id', 2],
      [2, 'media_id', 3],
    ])
    expect(r.mediaIds).toHaveLength(3)
  })

  it('never republishes a story slide that is already live', async () => {
    const { graph, created } = fakeGraph()
    const items = [slide(0, { media_id: 'old0' }), slide(1, { live: true }), slide(2)]
    expect(publishableIndexes(story(items))).toEqual([2])
    const r = await publishToInstagram(graph, '1', story(items), url)
    expect(created()).toHaveLength(1)
    expect(r.mediaIds[0]).toBe('old0')
  })

  it('a saved container already PUBLISHED: marked live, nothing sent', async () => {
    const { graph, calls } = fakeGraph({ statusOf: { old1: 'PUBLISHED' } })
    const saved: [number, Partial<PostItem>][] = []
    await publishToInstagram(graph, '1', story([slide(0, { media_id: 'm0' }), slide(1, { container_id: 'old1' })]), url, {
      onSlide: async (i, patch) => {
        saved.push([i, patch])
      },
    })
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
    expect(saved).toEqual([[1, { live: true }]])
  })

  it('a saved container still FINISHED is published as is; an EXPIRED one is replaced', async () => {
    const reuse = fakeGraph({ statusOf: { old1: 'FINISHED' } })
    await publishToInstagram(reuse.graph, '1', story([slide(0, { media_id: 'm0' }), slide(1, { container_id: 'old1' })]), url)
    expect(reuse.created()).toHaveLength(0)
    expect(reuse.publishCalls().map((c) => c.body!.get('creation_id'))).toEqual(['old1'])

    const replace = fakeGraph({ statusOf: { old1: 'EXPIRED' } })
    await publishToInstagram(replace.graph, '1', story([slide(0, { media_id: 'm0' }), slide(1, { container_id: 'old1' })]), url)
    expect(replace.created()).toHaveLength(1)
    expect(replace.publishCalls()[0].body!.get('creation_id')).not.toBe('old1')
  })

  it('an error answer while the slide went live: marked live, the story goes on', async () => {
    const { graph, publishCalls } = fakeGraph({ publish: ['restricted', 'ok'], restrictedPublishes: true })
    const saved: [number, Partial<PostItem>][] = []
    await publishToInstagram(graph, '1', story([slide(0), slide(1)]), url, {
      onSlide: async (i, patch) => {
        saved.push([i, patch])
      },
    })
    expect(publishCalls()).toHaveLength(2)
    expect(saved.filter(([, p]) => !p.container_id).map(([i, p]) => [i, Object.keys(p)[0]])).toEqual([
      [0, 'live'],
      [1, 'media_id'],
    ])
  })

  it('stops before a new slide once the time budget is spent', async () => {
    const { graph, calls } = fakeGraph()
    await expect(publishToInstagram(graph, '1', story([slide(0), slide(1)]), url, { deadline: Date.now() - 1 })).rejects.toBeInstanceOf(PublishLaterError)
    expect(calls).toHaveLength(0)
  })
})

describe('captions and the account', () => {
  it('reads the header line of a carousel caption', () => {
    expect(captionHeader(CAPTION)).toBe('Demain à Paris · samedi 7 novembre')
    expect(captionHeader('Accroche\n\nTon week-end à Paris · du 6 au 8 novembre\n• …')).toBe('Ton week-end à Paris · du 6 au 8 novembre')
    expect(captionHeader('Une légende sans en-tête')).toBeNull()
    expect(captionHeader(null)).toBeNull()
  })

  it('finds a post by its header line, within the past week only', () => {
    const now = new Date('2026-11-08T17:00:00Z')
    const media: RecentMedia[] = [
      { id: 'a', caption: 'x\n\nDemain à Paris · lundi 9 novembre\n• …', timestamp: '2026-11-08T16:00:05+0000', permalink: null },
      { id: 'b', caption: 'x\n\nDemain à Paris · samedi 7 novembre\n• …', timestamp: '2026-11-06T17:01:00+0000', permalink: null },
      { id: 'c', caption: 'x\n\nDemain à Paris · vendredi 6 novembre', timestamp: '2026-10-20T17:01:00+0000', permalink: null },
    ]
    expect(findByHeader(media, 'Demain à Paris · samedi 7 novembre', now)?.id).toBe('b')
    expect(findByHeader(media, 'Demain à Paris · samedi 7', now)).toBeNull()
    expect(findByHeader(media, 'Demain à Paris · vendredi 6 novembre', now)).toBeNull()
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

  it('keeps the error codes in the message, never the token', async () => {
    const { graph } = fakeGraph({ publish: ['restricted'] })
    const err = await graph.publish('1', 'c1').catch((e) => e)
    expect(err.message).toBe('Nous restreignons certaines activités afin de protéger notre communauté. (code 4/2207051, trace AbC)')
    expect(redact('bad token SECRETTOKEN123 here', 'SECRETTOKEN123')).toBe('bad token [jeton] here')
  })

  it('knows the only errors that publish nothing', () => {
    expect(isNotReady(new InstagramApiError('x', 400, 9007, 2207027))).toBe(true)
    expect(isNotReady(new InstagramApiError('Le contenu n’est pas prêt à être publié, patientez un peu', 400))).toBe(true)
    expect(isQuotaReached(new InstagramApiError('x', 400, 9, 2207042))).toBe(true)
    expect(isQuotaReached(new InstagramApiError('Vous avez atteint le nombre maximal de publications pouvant être publiées par l’API', 400))).toBe(true)
    const restricted = new InstagramApiError('Nous restreignons certaines activités', 400, 4, 2207051)
    expect(isNotReady(restricted) || isQuotaReached(restricted)).toBe(false)
    expect(isNotReady(new Error('pas prêt'))).toBe(false)
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
