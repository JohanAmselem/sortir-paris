/**
 * Event photos for the slides: only the event's own image_url (from our
 * sources), never anything searched elsewhere. Too small (< 600 px wide),
 * unreachable or not an image → the slide falls back to typography.
 */
import sharp from 'sharp'

export const MIN_PHOTO_WIDTH = 600
const MAX_BYTES = 15 * 1024 * 1024
const TIMEOUT_MS = 8000

/** http(s) on a public host name only (no IP literal, no localhost). */
export function isFetchableUrl(raw: string | null | undefined): raw is string {
  if (!raw) return false
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return false
    if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return false
    return host.includes('.')
  } catch {
    return false
  }
}

export async function downloadPhoto(url: string): Promise<Buffer | null> {
  if (!isFetchableUrl(url)) return null
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'PanameClub/1.0 (+https://www.panameclub.fr)', Accept: 'image/*' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (type && !type.startsWith('image/') && !type.startsWith('application/octet-stream')) return null
    const len = Number(res.headers.get('content-length') ?? 0)
    if (len > MAX_BYTES) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length > 0 && buf.length <= MAX_BYTES ? buf : null
  } catch {
    return null
  }
}

/** Width of a downloaded image, or null when it is not a readable image. */
export async function photoWidth(buf: Buffer): Promise<number | null> {
  try {
    const meta = await sharp(buf).metadata()
    if (!meta.width || !meta.height) return null
    // EXIF orientation 5–8: width and height are swapped once displayed.
    return meta.orientation && meta.orientation >= 5 ? meta.height : meta.width
  } catch {
    return null
  }
}

export async function checkPhoto(url: string | null | undefined): Promise<{ ok: boolean; width: number | null }> {
  if (!url) return { ok: false, width: null }
  const buf = await downloadPhoto(url)
  if (!buf) return { ok: false, width: null }
  const width = await photoWidth(buf)
  return { ok: width != null && width >= MIN_PHOTO_WIDTH, width }
}

/** The photo cropped to the slide area, as a JPEG data URL for the renderer (null → fallback). */
export async function photoDataUrl(url: string, width: number, height: number): Promise<string | null> {
  const buf = await downloadPhoto(url)
  if (!buf) return null
  const w = await photoWidth(buf)
  if (w == null || w < MIN_PHOTO_WIDTH) return null
  try {
    const out = await sharp(buf).rotate().resize(width, height, { fit: 'cover', position: 'attention' }).jpeg({ quality: 86 }).toBuffer()
    return `data:image/jpeg;base64,${out.toString('base64')}`
  } catch {
    return null
  }
}
