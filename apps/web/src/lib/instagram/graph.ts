/**
 * Minimal client for the Instagram API with Instagram Login (graph.instagram.com).
 * Endpoints checked against Meta's documentation (see docs/INSTAGRAM.md):
 *   POST /{ig-user-id}/media                  image_url [+ is_carousel_item | media_type=STORIES]
 *   POST /{ig-user-id}/media                  media_type=CAROUSEL, children=id1,id2…, caption
 *   GET  /{container-id}?fields=status_code   FINISHED | IN_PROGRESS | ERROR | EXPIRED | PUBLISHED
 *   POST /{ig-user-id}/media_publish          creation_id
 *   GET  /{media-id}?fields=permalink
 *   GET  /{ig-user-id}/content_publishing_limit?fields=quota_usage,config
 *   GET  /me?fields=user_id,username
 *   GET  https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token (unversioned)
 * No deletion: the Instagram Login API cannot delete media (do it in the app).
 */

export const DEFAULT_GRAPH_BASE = 'https://graph.instagram.com/v23.0'

export function graphBase(): string {
  return (process.env.IG_GRAPH_BASE || DEFAULT_GRAPH_BASE).replace(/\/+$/, '')
}

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly subcode?: number
  ) {
    super(message)
    this.name = 'InstagramApiError'
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface GraphOptions {
  token: string
  base?: string
  fetch?: FetchLike
  /** Wait between status checks (tests use 0). */
  pollMs?: number
  pollTimeoutMs?: number
}

export class InstagramGraph {
  private readonly base: string
  private readonly f: FetchLike
  private readonly pollMs: number
  private readonly pollTimeoutMs: number

  constructor(private readonly opts: GraphOptions) {
    this.base = (opts.base ?? graphBase()).replace(/\/+$/, '')
    this.f = opts.fetch ?? ((input, init) => fetch(input, init))
    this.pollMs = opts.pollMs ?? 3000
    this.pollTimeoutMs = opts.pollTimeoutMs ?? 90_000
  }

  private async call<T>(method: 'GET' | 'POST', path: string, params: Record<string, string> = {}, absolute = false): Promise<T> {
    const url = new URL(absolute ? path : `${this.base}${path}`)
    const body = new URLSearchParams({ ...params, access_token: this.opts.token })
    let res: Response
    if (method === 'GET') {
      for (const [k, v] of body) url.searchParams.set(k, v)
      res = await this.f(url.toString(), { method, signal: AbortSignal.timeout(20_000), cache: 'no-store' })
    } else {
      res = await this.f(url.toString(), {
        method,
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(30_000),
        cache: 'no-store',
      })
    }
    let json: Record<string, unknown> = {}
    try {
      json = (await res.json()) as Record<string, unknown>
    } catch {
      // empty or non-JSON body
    }
    const err = json.error as { message?: string; code?: number; error_subcode?: number; error_user_msg?: string } | undefined
    if (!res.ok || err) {
      const msg = err?.error_user_msg || err?.message || `HTTP ${res.status}`
      throw new InstagramApiError(redact(msg, this.opts.token), res.status, err?.code, err?.error_subcode)
    }
    return json as T
  }

  me() {
    return this.call<{ user_id?: string; id?: string; username?: string }>('GET', '/me', { fields: 'user_id,username' })
  }

  async createImageContainer(igUserId: string, imageUrl: string, as: 'carousel_item' | 'story' | 'feed', caption?: string): Promise<string> {
    const params: Record<string, string> = { image_url: imageUrl }
    if (as === 'carousel_item') params.is_carousel_item = 'true'
    if (as === 'story') params.media_type = 'STORIES'
    if (caption && as === 'feed') params.caption = caption
    const r = await this.call<{ id: string }>('POST', `/${igUserId}/media`, params)
    return r.id
  }

  async createCarouselContainer(igUserId: string, children: string[], caption: string): Promise<string> {
    const r = await this.call<{ id: string }>('POST', `/${igUserId}/media`, {
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption,
    })
    return r.id
  }

  async containerStatus(containerId: string): Promise<string> {
    const r = await this.call<{ status_code?: string }>('GET', `/${containerId}`, { fields: 'status_code' })
    return r.status_code ?? 'UNKNOWN'
  }

  /** Wait until a container is FINISHED (images are usually ready at once). */
  async waitFinished(containerId: string): Promise<void> {
    const deadline = Date.now() + this.pollTimeoutMs
    for (;;) {
      const status = await this.containerStatus(containerId)
      if (status === 'FINISHED') return
      if (status === 'ERROR' || status === 'EXPIRED') throw new InstagramApiError(`Conteneur ${containerId} : ${status}`, 400)
      if (Date.now() >= deadline) throw new InstagramApiError(`Conteneur ${containerId} toujours ${status}`, 408)
      await sleep(this.pollMs)
    }
  }

  async publish(igUserId: string, creationId: string): Promise<string> {
    const r = await this.call<{ id: string }>('POST', `/${igUserId}/media_publish`, { creation_id: creationId })
    return r.id
  }

  async permalink(mediaId: string): Promise<string | null> {
    try {
      const r = await this.call<{ permalink?: string }>('GET', `/${mediaId}`, { fields: 'permalink' })
      return r.permalink ?? null
    } catch {
      return null
    }
  }

  /** Posts published in the last 24 h and the allowance (50 at the time of writing). */
  async publishingLimit(igUserId: string): Promise<{ usage: number; total: number }> {
    const r = await this.call<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>(
      'GET',
      `/${igUserId}/content_publishing_limit`,
      { fields: 'quota_usage,config' }
    )
    const row = r.data?.[0]
    return { usage: Number(row?.quota_usage ?? 0), total: Number(row?.config?.quota_total ?? 50) }
  }

  /** New long-lived token (60 days). The current one must be at least 24 h old and still valid. */
  async refreshToken(): Promise<{ token: string; expiresIn: number }> {
    const origin = new URL(this.base).origin
    const r = await this.call<{ access_token: string; expires_in: number }>(
      'GET',
      `${origin}/refresh_access_token`,
      { grant_type: 'ig_refresh_token' },
      true
    )
    if (!r.access_token) throw new InstagramApiError('Pas de jeton dans la réponse', 500)
    return { token: r.access_token, expiresIn: Number(r.expires_in ?? 0) }
  }
}

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve())

/** Never let the token end up in an error message stored in the database. */
export function redact(message: string, token: string): string {
  return token && token.length > 8 ? message.split(token).join('[jeton]') : message
}
