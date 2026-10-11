import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { ensureUserRow, getSessionUser, limit } from '@/app/club/_lib/api'
import { followArtists } from '@/app/club/_lib/artists'
import { SPOTIFY_STATE_COOKIE, spotifyArtistNames, spotifyConfigured, spotifyRedirectUri } from '@/lib/spotify'

export const dynamic = 'force-dynamic'

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y)
}

async function spotifyGet(path: string, token: string): Promise<unknown> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  })
  if (!res.ok) {
    console.error('[spotify] api status', path.split('?')[0], res.status)
    return null
  }
  return res.json()
}

/**
 * GET /api/spotify/callback — Spotify sends the member back here: exchange the
 * code, read top artists + followed artists, follow them on Paname Club. The
 * access token lives only for this request (never stored).
 */
export async function GET(request: NextRequest) {
  const back = new URL('/compte/artistes', request.nextUrl.origin)
  const done = (params: Record<string, string>) => {
    for (const [k, v] of Object.entries(params)) back.searchParams.set(k, v)
    const res = NextResponse.redirect(back)
    res.cookies.set(SPOTIFY_STATE_COOKIE, '', { path: '/api/spotify', maxAge: 0 })
    return res
  }
  if (!spotifyConfigured()) return done({ spotify: 'indisponible' })

  const params = request.nextUrl.searchParams
  if (params.get('error')) return done({ spotify: 'annule' })
  const code = params.get('code') ?? ''
  const state = params.get('state') ?? ''
  const expected = request.cookies.get(SPOTIFY_STATE_COOKIE)?.value ?? ''
  if (!code || code.length > 2000 || !sameState(state, expected)) return done({ spotify: 'erreur' })

  const user = await getSessionUser()
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent('/compte/artistes')}`, request.nextUrl.origin))
  const limited = limit(request, 'spotify-callback', 10, 10 * 60_000, user.id)
  if (limited) return limited

  try {
    const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: spotifyRedirectUri() }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    if (!tokenRes.ok) {
      console.error('[spotify] token status', tokenRes.status)
      return done({ spotify: 'erreur' })
    }
    const { access_token: token } = (await tokenRes.json()) as { access_token?: string }
    if (!token) return done({ spotify: 'erreur' })

    const [top, following] = await Promise.all([
      spotifyGet('/me/top/artists?limit=50&time_range=medium_term', token),
      spotifyGet('/me/following?type=artist&limit=50', token),
    ])
    if (top == null && following == null) return done({ spotify: 'erreur' })
    // Most listened first: they get the places when the follow limit is close.
    const names = [...spotifyArtistNames(top), ...spotifyArtistNames(following)]
    await ensureUserRow(user)
    const r = await followArtists(
      user.id,
      names.map((name) => ({ name }))
    )
    return done({ spotify: String(r.added), deja: String(r.already), ignores: String(r.skipped) })
  } catch (err) {
    console.error('[spotify] import failed', err)
    return done({ spotify: 'erreur' })
  }
}
