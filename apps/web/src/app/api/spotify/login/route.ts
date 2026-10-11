import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, limit } from '@/app/club/_lib/api'
import { SPOTIFY_STATE_COOKIE, spotifyAuthorizeUrl, spotifyConfigured, spotifyRedirectUri } from '@/lib/spotify'

export const dynamic = 'force-dynamic'

// GET /api/spotify/login — start the Spotify import (Mes artistes).
export async function GET(request: NextRequest) {
  const back = new URL('/compte/artistes', request.nextUrl.origin)
  if (!spotifyConfigured()) {
    back.searchParams.set('spotify', 'indisponible')
    return NextResponse.redirect(back)
  }
  const user = await getSessionUser()
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent('/compte/artistes')}`, request.nextUrl.origin))
  const limited = limit(request, 'spotify-login', 10, 10 * 60_000, user.id)
  if (limited) return limited

  const state = randomBytes(24).toString('base64url')
  const res = NextResponse.redirect(spotifyAuthorizeUrl(process.env.SPOTIFY_CLIENT_ID!, state, spotifyRedirectUri()))
  res.cookies.set(SPOTIFY_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/spotify',
    maxAge: 600,
  })
  return res
}
