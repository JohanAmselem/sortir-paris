/**
 * Small in-memory sliding-window rate limiter.
 * Per server instance only (Vercel Fluid reuses instances, so it is effective
 * against bursts); swap for Upstash when traffic grows.
 */
const buckets = new Map<string, number[]>()

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (hits.length >= limit) {
    buckets.set(key, hits)
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - hits[0])) / 1000) }
  }
  hits.push(now)
  buckets.set(key, hits)
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k)
  }
  return { ok: true, retryAfter: 0 }
}

export function clientIp(headers: Headers): string {
  return headers.get('x-real-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}
