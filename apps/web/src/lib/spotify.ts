/**
 * Spotify import (Mes artistes): authorization-code flow with the client
 * secret, done entirely on the server. Tokens are used once and never stored.
 */
import { absoluteUrl } from './site'

export const SPOTIFY_SCOPES = 'user-top-read user-follow-read'
export const SPOTIFY_STATE_COOKIE = 'pc_spotify_state'

export function spotifyConfigured(): boolean {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)
}

/**
 * Show the « Importer depuis Spotify » buttons. The Spotify app is in
 * development mode (25 allow-listed users) until Extended Quota is granted
 * (docs/SPOTIFY_EXTENDED_QUOTA.md): hidden unless NEXT_PUBLIC_SPOTIFY_IMPORT=1.
 */
export function spotifyImportEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SPOTIFY_IMPORT === '1' && spotifyConfigured()
}

export const spotifyRedirectUri = () => absoluteUrl('/api/spotify/callback')

export function spotifyAuthorizeUrl(clientId: string, state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    state,
    show_dialog: 'false',
  })
  return `https://accounts.spotify.com/authorize?${params}`
}

/** Artist names from /me/top/artists ({ items }) or /me/following ({ artists: { items } }). */
export function spotifyArtistNames(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return []
  const p = payload as { items?: unknown; artists?: { items?: unknown } }
  const items = Array.isArray(p.items) ? p.items : Array.isArray(p.artists?.items) ? p.artists!.items : []
  return (items as unknown[])
    .map((a) => (a && typeof a === 'object' && typeof (a as { name?: unknown }).name === 'string' ? (a as { name: string }).name.trim() : ''))
    .filter((n) => n.length > 0 && n.length <= 160)
}
