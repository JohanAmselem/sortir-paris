/** Pure: usable by client pages (login) and route handlers (auth callback). */

/** Only same-site relative paths: "/x" but not "//evil.com" or "/\evil.com". Default "/". */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next || typeof next !== 'string') return fallback
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  if (/[\u0000-\u001f]/.test(next) || next.includes('\\')) return fallback
  return next.slice(0, 500)
}
